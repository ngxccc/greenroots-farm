import {
  ComplaintStatus,
  DeliveryDay,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  SubscriptionStatus,
} from "@greenroots/shared";
import type { DrizzleDB } from "@/database/database.module";
import {
  batchAllocations,
  complaints,
  orderItems,
  orders,
  payments,
  subscriptions,
  userAddresses,
} from "@/database/schemas";
import { SEED_IDS } from "../constants/seed-ids.constant";
import { SEED_DATES, SEED_TIMESTAMPS } from "../constants/seed-dates.constant";

interface Tier3Result {
  userAddresses: number;
  orders: number;
  orderItems: number;
  batchAllocations: number;
  subscriptions: number;
  payments: number;
  complaints: number;
}

const SNAPSHOT_ADDRESS =
  "12 Nguyễn Văn Linh, Phường Tân Phú, Quận 7, TP. Hồ Chí Minh";

/**
 * Tier 3 - operational data: address book, retail order, FEFO allocations,
 * recurring subscription with a child order, payments and a complaint.
 */
export async function seedTier3Operational(
  db: DrizzleDB,
): Promise<Tier3Result> {
  await db
    .insert(userAddresses)
    .values({
      id: SEED_IDS.addressCustomer,
      userId: SEED_IDS.customer,
      receiverName: "Trần Thị Khách",
      phoneNumber: "0912345678",
      streetAddress: "12 Nguyễn Văn Linh, Phường Tân Phú",
      district: "Quận 7",
      city: "TP. Hồ Chí Minh",
      latitude: "10.72960000",
      longitude: "106.72180000",
      isDefault: true,
    })
    .onConflictDoNothing();

  await db
    .insert(subscriptions)
    .values({
      id: SEED_IDS.subscription,
      customerId: SEED_IDS.customer,
      planId: SEED_IDS.planFamily,
      userAddressId: SEED_IDS.addressCustomer,
      shippingAddress: SNAPSHOT_ADDRESS,
      shippingDistanceKm: "12.50",
      shippingFeePerDelivery: 0,
      planName: "Gói Rau Gia Đình 1 Tháng",
      price: 1200000,
      totalDeliveries: 8,
      weightPerDeliveryKg: "5.00",
      basketDescription:
        "Mỗi lần giao: 2kg rau ăn lá + 2kg rau củ quả + 1kg rau gia vị theo mùa.",
      deliveryDay: DeliveryDay.TUESDAY,
      remainingDeliveries: 7,
      status: SubscriptionStatus.ACTIVE,
      startDate: SEED_DATES.subscriptionStart,
      endDate: SEED_DATES.subscriptionEnd,
    })
    .onConflictDoNothing();

  await db
    .insert(orders)
    .values([
      {
        id: SEED_IDS.orderRetail,
        orderCode: "ORD-20261112-001",
        customerId: SEED_IDS.customer,
        shippingAddress: SNAPSHOT_ADDRESS,
        shippingDistanceKm: "12.50",
        shippingFee: 76750,
        subtotal: 125000,
        discountAmount: 0,
        totalAmount: 201750,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.PENDING,
        orderStatus: OrderStatus.PENDING_CONFIRMATION,
      },
      {
        id: SEED_IDS.orderSubscription,
        orderCode: "ORD-20261112-002",
        customerId: SEED_IDS.customer,
        subscriptionId: SEED_IDS.subscription,
        shippingAddress: SNAPSHOT_ADDRESS,
        shippingDistanceKm: "12.50",
        shippingFee: 0,
        subtotal: 150000,
        discountAmount: 0,
        totalAmount: 150000,
        paymentMethod: PaymentMethod.SUBSCRIPTION,
        paymentStatus: PaymentStatus.PAID,
        orderStatus: OrderStatus.COMPLETED,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(orderItems)
    .values([
      {
        id: SEED_IDS.orderItemTomato,
        orderId: SEED_IDS.orderRetail,
        productId: SEED_IDS.productCherryTomato,
        quantity: "2.00",
        unitPrice: 45000,
      },
      {
        id: SEED_IDS.orderItemSpinach,
        orderId: SEED_IDS.orderRetail,
        productId: SEED_IDS.productSpinach,
        quantity: "1.00",
        unitPrice: 35000,
      },
      {
        id: SEED_IDS.orderItemSubscription,
        orderId: SEED_IDS.orderSubscription,
        productId: SEED_IDS.productCherryTomato,
        quantity: "3.00",
        unitPrice: 50000,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(batchAllocations)
    .values([
      {
        id: SEED_IDS.allocationTomato,
        orderItemId: SEED_IDS.orderItemTomato,
        batchId: SEED_IDS.batchTomato,
        allocatedQuantity: "2.00",
      },
      {
        id: SEED_IDS.allocationSpinach,
        orderItemId: SEED_IDS.orderItemSpinach,
        batchId: SEED_IDS.batchSpinach,
        allocatedQuantity: "1.00",
      },
      {
        id: SEED_IDS.allocationSubscription,
        orderItemId: SEED_IDS.orderItemSubscription,
        batchId: SEED_IDS.batchTomato,
        allocatedQuantity: "3.00",
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(payments)
    .values([
      {
        id: SEED_IDS.paymentRetail,
        orderId: SEED_IDS.orderRetail,
        amount: 201750,
        paymentMethod: PaymentMethod.COD,
        status: PaymentStatus.PENDING,
        transactionType: PaymentTransactionType.PAYMENT,
      },
      {
        id: SEED_IDS.paymentSubscription,
        subscriptionId: SEED_IDS.subscription,
        amount: 1200000,
        paymentMethod: PaymentMethod.PAYOS,
        status: PaymentStatus.PAID,
        transactionType: PaymentTransactionType.PAYMENT,
        orderCode: 20261112001,
        referenceCode: "PAYOS-SUB-20261112-001",
        paymentUrl: "https://pay.payos.vn/web/greenroots-subscription-001",
        rawPayload: {
          orderCode: 20261112001,
          amount: 1200000,
          description: "Thanh toan goi rau dinh ky",
          reference: "PAYOS-SUB-20261112-001",
          transactionDateTime: SEED_TIMESTAMPS.subscriptionPaidAt.toISOString(),
          paymentLinkId: "greenroots-subscription-001",
        },
        paidAt: SEED_TIMESTAMPS.subscriptionPaidAt,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(complaints)
    .values({
      id: SEED_IDS.complaint,
      orderId: SEED_IDS.orderSubscription,
      customerId: SEED_IDS.customer,
      reason: "Rau bị dập nát khi giao, đề nghị đổi bù.",
      proofImageUrls: [
        "https://res.cloudinary.com/greenroots/complaints/order-002-01.webp",
      ],
      proofVideoUrl: null,
      status: ComplaintStatus.PENDING,
      resolution: null,
    })
    .onConflictDoNothing();

  return {
    userAddresses: 1,
    orders: 2,
    orderItems: 3,
    batchAllocations: 3,
    subscriptions: 1,
    payments: 2,
    complaints: 1,
  };
}
