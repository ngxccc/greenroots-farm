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
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  API_ERROR_CODES,
  BUSINESS_RULES,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  UserStatus,
} from "@greenroots/shared";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import { MESSAGES } from "@/common/constants/messages.constant";
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
import type { ResolvedQuoteAddress } from "@/modules/users/users.interface";
import type {
  CheckoutRequestInput,
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
} from "./orders.interface";
import type { ShippingQuote } from "./shipping/dto";
import { ShippingService } from "./shipping/shipping.service";

const VN_CALENDAR_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: VIETNAM_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

interface CatalogProductStockRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
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
    const shippingAddressSnapshot = this.formatAddressSnapshot(resolvedAddress);
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
          shippingAddressSnapshot,
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
      readonly shippingAddressSnapshot: string;
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
        shippingAddressSnapshot: params.shippingAddressSnapshot,
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
      readonly shippingAddressSnapshot: string;
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
        shippingAddress: params.shippingAddressSnapshot,
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
      .returning({
        id: orders.id,
        orderCode: orders.orderCode,
        orderStatus: orders.orderStatus,
        paymentMethod: orders.paymentMethod,
        paymentStatus: orders.paymentStatus,
        shippingAddress: orders.shippingAddress,
        shippingFee: orders.shippingFee,
        subtotal: orders.subtotal,
        discountAmount: orders.discountAmount,
        loyaltyPointsUsed: orders.loyaltyPointsUsed,
        totalAmount: orders.totalAmount,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
      });

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

    return {
      id: createdOrder.id,
      orderCode: createdOrder.orderCode,
      orderStatus: createdOrder.orderStatus,
      paymentMethod: createdOrder.paymentMethod,
      paymentStatus: createdOrder.paymentStatus,
      shippingAddress: createdOrder.shippingAddress,
      shippingDistanceKm: params.shippingDistanceKm,
      shippingFeeVnd: createdOrder.shippingFee,
      subtotalVnd: createdOrder.subtotal,
      discountAmountVnd: createdOrder.discountAmount,
      loyaltyPointsUsed: createdOrder.loyaltyPointsUsed,
      totalAmountVnd: createdOrder.totalAmount,
      items: params.evaluated.map((item) => ({
        id: insertedItemIdByProduct.get(item.normalized.productId) ?? "",
        productId: item.normalized.productId,
        productName: item.row?.name ?? "",
        productSlug: item.row?.slug ?? "",
        unit: item.row?.unit ?? "",
        quantity: item.normalized.quantity,
        unitPriceVnd: item.unitPriceVnd,
        lineTotalVnd: item.lineTotalVnd,
      })),
      createdAt: createdOrder.createdAt.toISOString(),
      updatedAt: createdOrder.updatedAt.toISOString(),
    };
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

  private formatAddressSnapshot(address: ResolvedQuoteAddress): string {
    return `${address.receiverName} (${address.phoneNumber}) - ${address.formattedAddress}`;
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
