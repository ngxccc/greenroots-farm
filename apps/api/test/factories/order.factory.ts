import { randomUUID } from "node:crypto";
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
} from "@greenroots/shared";
import type { DrizzleDB } from "@/database/database.module";
import {
  orderItems,
  orders,
  payments,
  type Order,
  type OrderItem,
} from "@/database/schemas";

/**
 * Line item input for the order test factory.
 */
export interface CreateOrderItemInput {
  readonly productId: string;
  readonly quantity: string;
  readonly unitPrice: number;
}

/**
 * Options for creating an order graph (`orders`, `order_items`, and `payments`) in integration tests.
 */
export interface CreateOrderOptions {
  readonly customerId: string;
  readonly orderCode?: string;
  readonly orderStatus?: OrderStatus;
  readonly paymentMethod?: PaymentMethod;
  readonly paymentStatus?: PaymentStatus;
  readonly loyaltyPointsUsed?: number;
  readonly shippingFee?: number;
  readonly deliveredAt?: Date | null;
  readonly items: readonly CreateOrderItemInput[];
}

/**
 * Inserts an order, its line items, and its initial payment record for integration tests.
 *
 * @param db Drizzle database client.
 * @param options Order attributes and line items.
 * @returns Persisted `order` and `items` rows.
 */
export async function createOrder(
  db: DrizzleDB,
  options: CreateOrderOptions,
): Promise<{ readonly order: Order; readonly items: OrderItem[] }> {
  const uid = randomUUID().slice(0, 6).toUpperCase();
  const subtotal = options.items.reduce(
    (sum, item) =>
      sum +
      Math.round(
        (Math.round(Number(item.quantity) * 100) * item.unitPrice) / 100,
      ),
    0,
  );
  const loyaltyPointsUsed = options.loyaltyPointsUsed ?? 0;
  const shippingFee = options.shippingFee ?? 15_000;
  const totalAmount = subtotal - loyaltyPointsUsed + shippingFee;
  const paymentMethod = options.paymentMethod ?? PaymentMethod.COD;
  const paymentStatus = options.paymentStatus ?? PaymentStatus.PENDING;

  const [createdOrder] = await db
    .insert(orders)
    .values({
      orderCode: options.orderCode ?? `ORD-20261121-${uid}`,
      customerId: options.customerId,
      receiverName: "Nguyễn Thị Khách",
      receiverPhone: "0912345678",
      shippingAddress: "12 Nguyễn Văn Linh, Quận 7, TP. Hồ Chí Minh",
      shippingDistanceKm: "5.00",
      shippingFee,
      subtotal,
      discountAmount: loyaltyPointsUsed,
      loyaltyPointsUsed,
      totalAmount,
      paymentMethod,
      paymentStatus,
      orderStatus: options.orderStatus ?? OrderStatus.PENDING_CONFIRMATION,
      deliveredAt: options.deliveredAt ?? null,
    })
    .returning();

  if (!createdOrder) {
    throw new Error("Failed to create Order entity in test factory");
  }

  const createdItems = await db
    .insert(orderItems)
    .values(
      options.items.map((item) => ({
        orderId: createdOrder.id,
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      })),
    )
    .returning();

  await db.insert(payments).values({
    orderId: createdOrder.id,
    amount: totalAmount,
    paymentMethod,
    status: paymentStatus,
    transactionType: PaymentTransactionType.PAYMENT,
  });

  return { order: createdOrder, items: createdItems };
}
