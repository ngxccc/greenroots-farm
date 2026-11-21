import { randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNull,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  API_ERROR_CODES,
  BUSINESS_RULES,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  UserStatus,
  type ProductImageUrls,
} from "@greenroots/shared";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import { MESSAGES } from "@/common/constants/messages.constant";
import type { PaginationMetaDto } from "@/common/dto/api-response.dto";
import { buildPaginationMeta } from "@/common/utils/api-response.util";
import { extractDatabaseErrorDetails } from "@/common/utils/error.util";
import {
  DATABASE_CONNECTION,
  type DrizzleDB,
  type DrizzleTx,
} from "@/database/database.module";
import {
  categories,
  orderItems,
  orders,
  payments,
  products,
  users,
} from "@/database/schemas";
import { LIVE_AVAILABLE_QUANTITY_EXPR } from "@/modules/catalog/products.service";
import { FarmSettingsService } from "@/modules/farms/farm-settings.service";
import { AddressService } from "@/modules/users/address.service";
import type {
  CheckoutRequestInput,
  ListMyOrdersQuery,
  OrderItemProjection,
  OrderProjection,
  ValidateCartRequestInput,
  ValidateCartResponse,
  ValidatedCartItem,
} from "./dto";
import {
  CROCKFORD_BASE32_ALPHABET,
  ORDER_CODE_MAX_GENERATION_ATTEMPTS,
  ORDER_CODE_PREFIX,
  ORDER_CODE_RANDOM_LENGTH,
  ORDER_ITEM_MAX_QUANTITY,
  VIETNAM_TIMEZONE,
  type CartItemIssue,
  type NormalizedCartItem,
  type OrderSortOption,
} from "./orders.interface";
import type { ShippingQuote } from "./shipping/dto";
import { ShippingService } from "./shipping/shipping.service";

const VN_CALENDAR_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: VIETNAM_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const ORDER_COLUMNS = {
  id: orders.id,
  orderCode: orders.orderCode,
  orderStatus: orders.orderStatus,
  paymentMethod: orders.paymentMethod,
  paymentStatus: orders.paymentStatus,
  receiverName: orders.receiverName,
  receiverPhone: orders.receiverPhone,
  shippingAddress: orders.shippingAddress,
  shippingDistanceKm: orders.shippingDistanceKm,
  shippingFee: orders.shippingFee,
  subtotal: orders.subtotal,
  discountAmount: orders.discountAmount,
  loyaltyPointsUsed: orders.loyaltyPointsUsed,
  totalAmount: orders.totalAmount,
  createdAt: orders.createdAt,
  updatedAt: orders.updatedAt,
} as const;

type OrderRow = Pick<typeof orders.$inferSelect, keyof typeof ORDER_COLUMNS>;

const ORDER_SORT_EXPRESSIONS = new Map<OrderSortOption, SQL[]>([
  ["createdAt:desc", [desc(orders.createdAt), desc(orders.id)]],
  ["createdAt:asc", [asc(orders.createdAt), desc(orders.id)]],
  ["totalAmount:desc", [desc(orders.totalAmount), desc(orders.id)]],
  ["totalAmount:asc", [asc(orders.totalAmount), desc(orders.id)]],
]);

interface CatalogProductStockRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly imageUrls: ProductImageUrls | null;
  readonly unit: string;
  readonly basePrice: number;
  readonly salePrice: number | null;
  readonly isActive: boolean;
  readonly deletedAt: Date | null;
  readonly categoryIsActive: boolean;
  readonly categoryDeletedAt: Date | null;
  readonly availableQuantity: string | number;
}

interface EvaluatedCartItem {
  readonly normalized: NormalizedCartItem;
  readonly row: CatalogProductStockRow | undefined;
  readonly isSellableSku: boolean;
  readonly availableQuantity: number;
  readonly availableCents: number;
  readonly unitPriceVnd: number;
  readonly lineTotalVnd: number;
  readonly isAvailable: boolean;
  readonly issue: CartItemIssue | null;
}

interface ComputedOrderTotals {
  readonly subtotalVnd: number;
  readonly loyaltyPointsUsed: number;
  readonly discountAmountVnd: number;
  readonly totalAmountVnd: number;
}

/**
 * Orchestrates diagnostic cart validation and atomic COD checkout transactions
 * with server-authoritative catalog pricing, MOV enforcement, shipping quotes,
 * and serialized loyalty-point deductions (`ADR-0031`).
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DrizzleDB,
    private readonly addressService: AddressService,
    private readonly shippingService: ShippingService,
    private readonly farmSettingsService: FarmSettingsService,
  ) {}

  /**
   * Lists the authenticated customer's orders with pagination, status filtering,
   * and deterministic sorting, excluding internal allocation and payment gateway fields (`ADR-0032`).
   *
   * @param sub Authenticated customer UUID from JWT `sub`.
   * @param query Validated pagination, status filter, and sort options.
   * @returns Closed `OrderProjection` page and pagination metadata.
   */
  async listMyOrders(
    sub: string,
    query: ListMyOrdersQuery,
  ): Promise<{ items: OrderProjection[]; meta: PaginationMetaDto }> {
    await this.loadActiveCustomer(this.db, sub, false);

    const whereClause = query.status
      ? and(eq(orders.customerId, sub), eq(orders.orderStatus, query.status))
      : eq(orders.customerId, sub);

    const [countRow] = await this.db
      .select({ total: count() })
      .from(orders)
      .where(whereClause);

    const total = Number(countRow?.total ?? 0);
    const meta = buildPaginationMeta(total, query.page, query.limit);
    const offset = (query.page - 1) * query.limit;

    if (total === 0 || offset >= total) {
      return { items: [], meta };
    }

    const orderByClause = ORDER_SORT_EXPRESSIONS.get(query.sort) ?? [
      desc(orders.createdAt),
      desc(orders.id),
    ];

    const orderRows = await this.db
      .select(ORDER_COLUMNS)
      .from(orders)
      .where(whereClause)
      .orderBy(...orderByClause)
      .limit(query.limit)
      .offset(offset);

    if (orderRows.length === 0) {
      return { items: [], meta };
    }

    const itemsByOrderId = await this.hydrateOrderItemsByOrderIds(
      orderRows.map((row) => row.id),
    );

    return {
      items: orderRows.map((row) =>
        this.mapOrderRowToProjection(row, itemsByOrderId.get(row.id) ?? []),
      ),
      meta,
    };
  }

  /**
   * Retrieves a single owned customer order with line items and totals (`ADR-0032`).
   * Throws `404 ORDER_NOT_FOUND` for both unknown IDs and orders owned by another customer.
   *
   * @param sub Authenticated customer UUID from JWT `sub`.
   * @param orderId Target order UUIDv7 identifier.
   * @returns Closed `OrderProjection` including line items and monetary totals.
   */
  async getMyOrderById(sub: string, orderId: string): Promise<OrderProjection> {
    await this.loadActiveCustomer(this.db, sub, false);

    const [orderRow] = await this.db
      .select(ORDER_COLUMNS)
      .from(orders)
      .where(and(eq(orders.id, orderId), eq(orders.customerId, sub)))
      .limit(1);

    if (!orderRow) {
      throw new NotFoundException({
        code: API_ERROR_CODES.ORDER_NOT_FOUND,
        detail: MESSAGES.ORDERS.NOT_FOUND,
      });
    }

    const itemsByOrderId = await this.hydrateOrderItemsByOrderIds([
      orderRow.id,
    ]);

    return this.mapOrderRowToProjection(
      orderRow,
      itemsByOrderId.get(orderRow.id) ?? [],
    );
  }

  /**
   * Validates cart items, live sellable stock, delivery quote, loyalty cap,
   * and minimum order value without mutating persisted state.
   *
   * @param sub Authenticated customer UUID from JWT `sub`.
   * @param input Validated cart validation payload.
   * @returns Non-throwing `200` diagnostic cart validation summary.
   */
  async validateCart(
    sub: string,
    input: ValidateCartRequestInput,
  ): Promise<ValidateCartResponse> {
    const normalizedItems = this.normalizeCartItems(input.items);
    const activeCustomer = await this.loadActiveCustomer(this.db, sub, false);
    const shipping = await this.resolveCartValidationShipping(sub, input);
    const productRows = await this.loadCatalogProductsWithStock(
      this.db,
      normalizedItems.map((item) => item.productId),
    );
    const evaluated = this.evaluateCartItems(normalizedItems, productRows);

    const totals = this.computeOrderTotals({
      evaluated,
      requestedLoyaltyPoints: input.loyaltyPoints,
      availableRewardPoints: activeCustomer.rewardPoints,
      shippingFeeVnd: shipping?.feeVnd ?? 0,
      clientTotalVnd: input.clientTotalVnd,
    });

    const items: ValidatedCartItem[] = evaluated.map((item) => {
      const visibleRow = item.row?.deletedAt === null ? item.row : undefined;
      return {
        productId: item.normalized.productId,
        name: visibleRow?.name ?? null,
        slug: visibleRow?.slug ?? null,
        unit: visibleRow?.unit ?? null,
        requestedQuantity: item.normalized.quantity,
        availableQuantity: item.availableQuantity,
        unitPriceVnd: item.unitPriceVnd,
        lineTotalVnd: item.lineTotalVnd,
        isAvailable: item.isAvailable,
        issue: item.issue,
      };
    });

    const meetsMinOrderValue =
      totals.subtotalVnd >= BUSINESS_RULES.MIN_ORDER_VALUE_VND;
    const allItemsAvailable = items.every((item) => item.isAvailable);
    const isDeliverable = shipping?.isDeliverable ?? false;

    return {
      isValid: allItemsAvailable && meetsMinOrderValue && isDeliverable,
      meetsMinOrderValue,
      minOrderValueVnd: BUSINESS_RULES.MIN_ORDER_VALUE_VND,
      items,
      subtotalVnd: totals.subtotalVnd,
      shipping,
      requestedLoyaltyPoints: input.loyaltyPoints,
      appliedLoyaltyPoints: totals.loyaltyPointsUsed,
      availableLoyaltyPoints: activeCustomer.rewardPoints,
      discountAmountVnd: totals.discountAmountVnd,
      totalAmountVnd: totals.totalAmountVnd,
    };
  }

  /**
   * Places a Cash-on-Delivery order atomically with server-recomputed pricing,
   * MOV enforcement, delivery radius check, serialized loyalty deduction, and
   * paired `payments` ledger creation.
   *
   * @param sub Authenticated customer UUID from JWT `sub`.
   * @param input Validated COD checkout payload.
   * @returns Closed `OrderProjection` created in `PENDING_CONFIRMATION`.
   */
  async checkoutCod(
    sub: string,
    input: CheckoutRequestInput,
  ): Promise<OrderProjection> {
    const normalizedItems = this.normalizeCartItems(input.items);

    const settings = await this.farmSettingsService.getSettings();
    if (!settings.isCodEnabled) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.ORDER_COD_DISABLED,
        detail: MESSAGES.ORDERS.COD_DISABLED,
      });
    }

    const resolvedAddress = await this.addressService.resolveAddressForQuote(
      sub,
      input.addressId,
    );
    const shippingQuote = await this.shippingService.quoteForCoordinates(
      {
        latitude: resolvedAddress.latitude,
        longitude: resolvedAddress.longitude,
      },
      { isSubscription: false },
    );

    if (!shippingQuote.isDeliverable || shippingQuote.feeVnd === null) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.OUT_OF_DELIVERY_RADIUS,
        detail: MESSAGES.ORDERS.OUT_OF_DELIVERY_RADIUS,
        invalidParams: [
          {
            name: "addressId",
            code: API_ERROR_CODES.OUT_OF_DELIVERY_RADIUS,
            reason: MESSAGES.ORDERS.OUT_OF_DELIVERY_RADIUS,
            params: {
              maxRadiusKm: shippingQuote.maxRadiusKm,
              roadDistanceKm: shippingQuote.roadDistanceKm,
            },
          },
        ],
      });
    }

    const shippingFeeVnd = shippingQuote.feeVnd;
    const shippingDistanceKmStr = shippingQuote.roadDistanceKm.toFixed(2);
    const yyyymmdd = this.formatCalendarDateVn(new Date()).replaceAll("-", "");

    for (
      let attempt = 1;
      attempt <= ORDER_CODE_MAX_GENERATION_ATTEMPTS;
      attempt += 1
    ) {
      try {
        return await this.executeCheckoutTransaction(sub, input, {
          normalizedItems,
          shippingFeeVnd,
          receiverName: resolvedAddress.receiverName,
          receiverPhone: resolvedAddress.phoneNumber,
          shippingAddress: resolvedAddress.formattedAddress,
          shippingDistanceKm: shippingQuote.roadDistanceKm,
          shippingDistanceKmStr,
          yyyymmdd,
        });
      } catch (error) {
        if (this.isOrderCodeUniqueViolation(error)) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException({
      code: API_ERROR_CODES.CONFLICT_RECORD,
      detail: MESSAGES.ORDERS.CODE_GENERATION_EXHAUSTED,
    });
  }

  private async executeCheckoutTransaction(
    sub: string,
    input: CheckoutRequestInput,
    params: {
      readonly normalizedItems: readonly NormalizedCartItem[];
      readonly shippingFeeVnd: number;
      readonly receiverName: string;
      readonly receiverPhone: string;
      readonly shippingAddress: string;
      readonly shippingDistanceKm: number;
      readonly shippingDistanceKmStr: string;
      readonly yyyymmdd: string;
    },
  ): Promise<OrderProjection> {
    return this.db.transaction(async (tx) => {
      // Lock the customer row first to serialize concurrent loyalty-point redemptions under READ COMMITTED.
      const lockedCustomer = await this.loadActiveCustomer(tx, sub, true);

      const productRows = await this.loadCatalogProductsWithStock(
        tx,
        params.normalizedItems.map((item) => item.productId),
      );
      const evaluated = this.evaluateCartItems(
        params.normalizedItems,
        productRows,
      );

      this.assertCheckoutItemsValid(evaluated);

      const totals = this.computeOrderTotals({
        evaluated,
        requestedLoyaltyPoints: input.loyaltyPoints,
        availableRewardPoints: lockedCustomer.rewardPoints,
        shippingFeeVnd: params.shippingFeeVnd,
        clientTotalVnd: input.clientTotalVnd,
      });

      if (totals.subtotalVnd < BUSINESS_RULES.MIN_ORDER_VALUE_VND) {
        throw new UnprocessableEntityException({
          code: API_ERROR_CODES.ORDER_BELOW_MINIMUM_VALUE,
          detail: MESSAGES.ORDERS.BELOW_MINIMUM_VALUE,
          invalidParams: [
            {
              name: "items",
              code: API_ERROR_CODES.ORDER_BELOW_MINIMUM_VALUE,
              reason: MESSAGES.ORDERS.BELOW_MINIMUM_VALUE,
              params: {
                minOrderValueVnd: BUSINESS_RULES.MIN_ORDER_VALUE_VND,
                currentSubtotalVnd: totals.subtotalVnd,
              },
            },
          ],
        });
      }

      if (totals.loyaltyPointsUsed > 0) {
        await tx
          .update(users)
          .set({
            rewardPoints: sql`${users.rewardPoints} - ${totals.loyaltyPointsUsed}`,
          })
          .where(and(eq(users.id, sub), isNull(users.deletedAt)));
      }

      return this.insertOrderAndPaymentRecords(tx, {
        customerId: sub,
        evaluated,
        totals,
        receiverName: params.receiverName,
        receiverPhone: params.receiverPhone,
        shippingAddress: params.shippingAddress,
        shippingDistanceKm: params.shippingDistanceKm,
        shippingDistanceKmStr: params.shippingDistanceKmStr,
        shippingFeeVnd: params.shippingFeeVnd,
        yyyymmdd: params.yyyymmdd,
      });
    });
  }

  private async loadActiveCustomer(
    executor: DrizzleDB | DrizzleTx,
    sub: string,
    lockForUpdate: boolean,
  ): Promise<{ id: string; rewardPoints: number }> {
    const query = executor
      .select({
        id: users.id,
        status: users.status,
        rewardPoints: users.rewardPoints,
      })
      .from(users)
      .where(and(eq(users.id, sub), isNull(users.deletedAt)));

    const [user] = lockForUpdate
      ? await query.for("update")
      : await query.limit(1);

    if (!user) {
      throw new UnauthorizedException({
        code: API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
        detail: MESSAGES.AUTH.TOKEN_INVALID_OR_EXPIRED,
      });
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException({
        code: API_ERROR_CODES.AUTH_ACCOUNT_SUSPENDED,
        detail: MESSAGES.AUTH.ACCOUNT_SUSPENDED,
      });
    }

    return { id: user.id, rewardPoints: user.rewardPoints };
  }

  private assertCheckoutItemsValid(
    evaluated: readonly EvaluatedCartItem[],
  ): void {
    const missingItems = evaluated.filter((item) => !item.isSellableSku);
    if (missingItems.length > 0) {
      throw new NotFoundException({
        code: API_ERROR_CODES.PRODUCT_NOT_FOUND,
        detail: MESSAGES.PRODUCTS.NOT_FOUND,
        invalidParams: missingItems.map((item) => ({
          name: "items",
          code: API_ERROR_CODES.PRODUCT_NOT_FOUND,
          reason: MESSAGES.PRODUCTS.NOT_FOUND,
          params: { productId: item.normalized.productId },
        })),
      });
    }

    const shortItems = evaluated.filter(
      (item) => item.issue === "INSUFFICIENT_STOCK",
    );
    if (shortItems.length > 0) {
      throw new ConflictException({
        code: API_ERROR_CODES.INSUFFICIENT_STOCK,
        detail: MESSAGES.ORDERS.INSUFFICIENT_STOCK,
        invalidParams: shortItems.map((item) => ({
          name: "items",
          code: API_ERROR_CODES.INSUFFICIENT_STOCK,
          reason: MESSAGES.ORDERS.INSUFFICIENT_STOCK,
          params: {
            productId: item.normalized.productId,
            requested: item.normalized.quantity,
            available: item.availableQuantity,
          },
        })),
      });
    }
  }

  private computeOrderTotals(params: {
    readonly evaluated: readonly EvaluatedCartItem[];
    readonly requestedLoyaltyPoints: number;
    readonly availableRewardPoints: number;
    readonly shippingFeeVnd: number;
    readonly clientTotalVnd: number | undefined;
  }): ComputedOrderTotals {
    const subtotalVnd = params.evaluated.reduce(
      (sum, item) => sum + item.lineTotalVnd,
      0,
    );
    // Cap loyalty redemption strictly at merchandise subtotal; never subsidize 3PL shipping fees.
    const loyaltyPointsUsed = Math.min(
      params.requestedLoyaltyPoints,
      params.availableRewardPoints,
      subtotalVnd,
    );
    const discountAmountVnd = loyaltyPointsUsed;
    const totalAmountVnd =
      subtotalVnd - discountAmountVnd + params.shippingFeeVnd;

    this.logClientTotalMismatchIfAny(params.clientTotalVnd, totalAmountVnd);

    return {
      subtotalVnd,
      loyaltyPointsUsed,
      discountAmountVnd,
      totalAmountVnd,
    };
  }

  private async insertOrderAndPaymentRecords(
    tx: DrizzleTx,
    params: {
      readonly customerId: string;
      readonly evaluated: readonly EvaluatedCartItem[];
      readonly totals: ComputedOrderTotals;
      readonly receiverName: string;
      readonly receiverPhone: string;
      readonly shippingAddress: string;
      readonly shippingDistanceKm: number;
      readonly shippingDistanceKmStr: string;
      readonly shippingFeeVnd: number;
      readonly yyyymmdd: string;
    },
  ): Promise<OrderProjection> {
    const orderCode = this.buildOrderCode(params.yyyymmdd);
    const [createdOrder] = await tx
      .insert(orders)
      .values({
        orderCode,
        customerId: params.customerId,
        receiverName: params.receiverName,
        receiverPhone: params.receiverPhone,
        shippingAddress: params.shippingAddress,
        shippingDistanceKm: params.shippingDistanceKmStr,
        shippingFee: params.shippingFeeVnd,
        subtotal: params.totals.subtotalVnd,
        discountAmount: params.totals.discountAmountVnd,
        loyaltyPointsUsed: params.totals.loyaltyPointsUsed,
        totalAmount: params.totals.totalAmountVnd,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.PENDING,
        orderStatus: OrderStatus.PENDING_CONFIRMATION,
      })
      .returning(ORDER_COLUMNS);

    if (!createdOrder) {
      throw new Error("Failed to insert order record.");
    }

    const insertedItems = await tx
      .insert(orderItems)
      .values(
        params.evaluated.map((item) => ({
          orderId: createdOrder.id,
          productId: item.normalized.productId,
          quantity: item.normalized.quantityFormatted,
          unitPrice: item.unitPriceVnd,
        })),
      )
      .returning({
        id: orderItems.id,
        productId: orderItems.productId,
      });

    const insertedItemIdByProduct = new Map(
      insertedItems.map((row) => [row.productId, row.id]),
    );

    await tx.insert(payments).values({
      orderId: createdOrder.id,
      amount: params.totals.totalAmountVnd,
      paymentMethod: PaymentMethod.COD,
      status: PaymentStatus.PENDING,
      transactionType: PaymentTransactionType.PAYMENT,
    });

    const projectedItems: OrderItemProjection[] = params.evaluated.map(
      (item) => ({
        id: insertedItemIdByProduct.get(item.normalized.productId) ?? "",
        productId: item.normalized.productId,
        productName: item.row?.name ?? "",
        productSlug: item.row?.slug ?? "",
        productImageUrl: item.row?.imageUrls?.[0] ?? null,
        unit: item.row?.unit ?? "",
        quantity: item.normalized.quantity,
        unitPriceVnd: item.unitPriceVnd,
        lineTotalVnd: item.lineTotalVnd,
      }),
    );

    return this.mapOrderRowToProjection(createdOrder, projectedItems);
  }

  private async resolveCartValidationShipping(
    sub: string,
    input: ValidateCartRequestInput,
  ): Promise<ShippingQuote | null> {
    if (input.addressId !== undefined || input.districtCode !== undefined) {
      return this.shippingService.quoteForCustomer(sub, {
        addressId: input.addressId,
        districtCode: input.districtCode,
        isSubscription: false,
      });
    }

    const defaultAddress =
      await this.addressService.resolveOptionalDefaultAddressForQuote(sub);

    if (!defaultAddress) {
      return null;
    }

    return this.shippingService.quoteForCoordinates(
      {
        latitude: defaultAddress.latitude,
        longitude: defaultAddress.longitude,
      },
      { isSubscription: false },
    );
  }

  private async loadCatalogProductsWithStock(
    executor: DrizzleDB | DrizzleTx,
    productIds: readonly string[],
  ): Promise<Map<string, CatalogProductStockRow>> {
    const rows = await executor
      .select({
        id: products.id,
        name: products.name,
        slug: products.slug,
        imageUrls: products.imageUrls,
        unit: products.unit,
        basePrice: products.basePrice,
        salePrice: products.salePrice,
        isActive: products.isActive,
        deletedAt: products.deletedAt,
        categoryIsActive: categories.isActive,
        categoryDeletedAt: categories.deletedAt,
        availableQuantity: LIVE_AVAILABLE_QUANTITY_EXPR,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(inArray(products.id, [...productIds]));

    return new Map(rows.map((row) => [row.id, row]));
  }

  private evaluateCartItems(
    normalizedItems: readonly NormalizedCartItem[],
    productRows: ReadonlyMap<string, CatalogProductStockRow>,
  ): EvaluatedCartItem[] {
    return normalizedItems.map((normalized) => {
      const row = productRows.get(normalized.productId);
      const isSellableSku =
        row?.deletedAt === null &&
        row.isActive &&
        row.categoryDeletedAt === null &&
        row.categoryIsActive;

      if (!row || !isSellableSku) {
        return {
          normalized,
          row,
          isSellableSku: false,
          availableQuantity: 0,
          availableCents: 0,
          unitPriceVnd: 0,
          lineTotalVnd: 0,
          isAvailable: false,
          issue: "PRODUCT_UNAVAILABLE",
        };
      }

      const availableQuantity = Number(row.availableQuantity);
      const availableCents = Math.round(availableQuantity * 100);
      const unitPriceVnd = row.salePrice ?? row.basePrice;
      const lineTotalVnd = this.computeLineTotalVnd(
        normalized.quantityCents,
        unitPriceVnd,
      );
      const isStockEnough = availableCents >= normalized.quantityCents;

      return {
        normalized,
        row,
        isSellableSku: true,
        availableQuantity,
        availableCents,
        unitPriceVnd,
        lineTotalVnd,
        isAvailable: isStockEnough,
        issue: isStockEnough ? null : "INSUFFICIENT_STOCK",
      };
    });
  }

  private normalizeCartItems(
    rawItems: readonly { productId: string; quantity: number }[],
  ): NormalizedCartItem[] {
    const mergedCentsByProduct = new Map<string, number>();

    for (const item of rawItems) {
      const cents = Math.round(item.quantity * 100);
      mergedCentsByProduct.set(
        item.productId,
        (mergedCentsByProduct.get(item.productId) ?? 0) + cents,
      );
    }

    const maxCents = Math.round(ORDER_ITEM_MAX_QUANTITY * 100);
    const normalized: NormalizedCartItem[] = [];

    for (const [productId, quantityCents] of mergedCentsByProduct.entries()) {
      if (quantityCents <= 0 || quantityCents > maxCents) {
        throw new BadRequestException({
          code: API_ERROR_CODES.VALIDATION_FAILED,
          detail: MESSAGES.VALIDATION.MAX_VALUE,
          invalidParams: [
            {
              name: "items",
              code: API_ERROR_CODES.TOO_BIG,
              reason: MESSAGES.VALIDATION.MAX_VALUE,
              params: {
                productId,
                maximum: ORDER_ITEM_MAX_QUANTITY,
              },
            },
          ],
        });
      }

      const quantity = quantityCents / 100;
      normalized.push({
        productId,
        quantityCents,
        quantity,
        quantityFormatted: quantity.toFixed(2),
      });
    }

    normalized.sort((a, b) => a.productId.localeCompare(b.productId));
    return normalized;
  }

  private async hydrateOrderItemsByOrderIds(
    orderIds: readonly string[],
  ): Promise<Map<string, OrderItemProjection[]>> {
    const itemsByOrderId = new Map<string, OrderItemProjection[]>();
    if (orderIds.length === 0) {
      return itemsByOrderId;
    }

    const rows = await this.db
      .select({
        id: orderItems.id,
        orderId: orderItems.orderId,
        productId: orderItems.productId,
        quantity: orderItems.quantity,
        unitPrice: orderItems.unitPrice,
        productName: products.name,
        productSlug: products.slug,
        productImageUrls: products.imageUrls,
        unit: products.unit,
      })
      .from(orderItems)
      // Preserve historical order line items even if a product was later deactivated or soft-deleted.
      .innerJoin(products, eq(orderItems.productId, products.id))
      .where(inArray(orderItems.orderId, [...orderIds]))
      .orderBy(asc(orderItems.id));

    for (const row of rows) {
      const quantity = Number(row.quantity);
      const quantityCents = Math.round(quantity * 100);
      const item: OrderItemProjection = {
        id: row.id,
        productId: row.productId,
        productName: row.productName,
        productSlug: row.productSlug,
        productImageUrl: row.productImageUrls?.[0] ?? null,
        unit: row.unit,
        quantity,
        unitPriceVnd: row.unitPrice,
        lineTotalVnd: this.computeLineTotalVnd(quantityCents, row.unitPrice),
      };

      const existing = itemsByOrderId.get(row.orderId);
      if (existing) {
        existing.push(item);
      } else {
        itemsByOrderId.set(row.orderId, [item]);
      }
    }

    return itemsByOrderId;
  }

  private mapOrderRowToProjection(
    row: OrderRow,
    items: OrderItemProjection[],
  ): OrderProjection {
    return {
      id: row.id,
      orderCode: row.orderCode,
      orderStatus: row.orderStatus,
      paymentMethod: row.paymentMethod,
      paymentStatus: row.paymentStatus,
      receiverName: row.receiverName,
      receiverPhone: row.receiverPhone,
      shippingAddress: row.shippingAddress,
      shippingDistanceKm: Number(row.shippingDistanceKm),
      shippingFeeVnd: row.shippingFee,
      subtotalVnd: row.subtotal,
      discountAmountVnd: row.discountAmount,
      loyaltyPointsUsed: row.loyaltyPointsUsed,
      totalAmountVnd: row.totalAmount,
      items,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private computeLineTotalVnd(
    quantityCents: number,
    unitPriceVnd: number,
  ): number {
    return Math.round((quantityCents * unitPriceVnd) / 100);
  }

  private buildOrderCode(yyyymmdd: string): string {
    return `${ORDER_CODE_PREFIX}-${yyyymmdd}-${this.generateRandomCodeSuffix()}`;
  }

  private generateRandomCodeSuffix(): string {
    const bytes = randomBytes(ORDER_CODE_RANDOM_LENGTH);
    let suffix = "";
    for (const byte of bytes) {
      suffix += CROCKFORD_BASE32_ALPHABET[byte % 32];
    }
    return suffix;
  }

  private formatCalendarDateVn(date: Date): string {
    return VN_CALENDAR_FORMATTER.format(date);
  }

  private logClientTotalMismatchIfAny(
    clientTotalVnd: number | undefined,
    serverTotalVnd: number,
  ): void {
    if (clientTotalVnd !== undefined && clientTotalVnd !== serverTotalVnd) {
      this.logger.debug(
        `${MESSAGES.ORDERS.CLIENT_TOTAL_MISMATCH_PREFIX} server=${serverTotalVnd} client=${clientTotalVnd}`,
      );
    }
  }

  private isOrderCodeUniqueViolation(error: unknown): boolean {
    const details = extractDatabaseErrorDetails(error);
    return (
      details.isDatabaseError &&
      details.code === PG_ERROR_CODE.UNIQUE_VIOLATION &&
      details.constraint === "orders_order_code_uidx"
    );
  }
}
