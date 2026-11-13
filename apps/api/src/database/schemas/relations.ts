import { defineRelations } from "drizzle-orm";
import { refreshTokens, userAddresses, users } from "./user.schema";
import { farmingLogs, farms, plots, seasons } from "./farm.schema";
import { batches, categories, products, wasteLogs } from "./catalog.schema";
import { batchAllocations, orderItems, orders } from "./order.schema";
import { subscriptionPlans, subscriptions } from "./subscription.schema";
import { payments } from "./payment.schema";
import { complaints } from "./complaint.schema";

/**
 * Drizzle v1 relational metadata for all 18 tables.
 * Explicit aliases disambiguate multiple FKs that point at `users`.
 */
export const schemaRelations = defineRelations(
  {
    users,
    refreshTokens,
    userAddresses,
    farms,
    plots,
    seasons,
    farmingLogs,
    categories,
    products,
    batches,
    wasteLogs,
    orders,
    orderItems,
    batchAllocations,
    subscriptionPlans,
    subscriptions,
    payments,
    complaints,
  },
  (r) => ({
    users: {
      refreshTokens: r.many.refreshTokens(),
      addresses: r.many.userAddresses(),
      farmingLogs: r.many.farmingLogs(),
      wasteLogsReported: r.many.wasteLogs({ alias: "reporter" }),
      wasteLogsApproved: r.many.wasteLogs({ alias: "approver" }),
      orders: r.many.orders(),
      subscriptions: r.many.subscriptions(),
      complaints: r.many.complaints(),
      complaintsResolved: r.many.complaints({ alias: "resolver" }),
      paymentsVerified: r.many.payments({ alias: "verifier" }),
    },

    refreshTokens: {
      user: r.one.users({
        from: r.refreshTokens.userId,
        to: r.users.id,
        optional: false,
      }),
    },

    userAddresses: {
      user: r.one.users({
        from: r.userAddresses.userId,
        to: r.users.id,
        optional: false,
      }),
      subscriptions: r.many.subscriptions(),
    },

    farms: {
      plots: r.many.plots(),
    },

    plots: {
      farm: r.one.farms({
        from: r.plots.farmId,
        to: r.farms.id,
        optional: false,
      }),
      seasons: r.many.seasons(),
    },

    seasons: {
      plot: r.one.plots({
        from: r.seasons.plotId,
        to: r.plots.id,
        optional: false,
      }),
      farmingLogs: r.many.farmingLogs(),
      batches: r.many.batches(),
    },

    farmingLogs: {
      season: r.one.seasons({
        from: r.farmingLogs.seasonId,
        to: r.seasons.id,
        optional: false,
      }),
      staff: r.one.users({
        from: r.farmingLogs.staffId,
        to: r.users.id,
        optional: false,
      }),
    },

    categories: {
      parent: r.one.categories({
        from: r.categories.parentId,
        to: r.categories.id,
      }),
      children: r.many.categories({
        from: r.categories.id,
        to: r.categories.parentId,
      }),
      products: r.many.products(),
    },

    products: {
      category: r.one.categories({
        from: r.products.categoryId,
        to: r.categories.id,
        optional: false,
      }),
      batches: r.many.batches(),
      orderItems: r.many.orderItems(),
    },

    batches: {
      season: r.one.seasons({
        from: r.batches.seasonId,
        to: r.seasons.id,
        optional: false,
      }),
      product: r.one.products({
        from: r.batches.productId,
        to: r.products.id,
        optional: false,
      }),
      wasteLogs: r.many.wasteLogs(),
      allocations: r.many.batchAllocations(),
    },

    wasteLogs: {
      batch: r.one.batches({
        from: r.wasteLogs.batchId,
        to: r.batches.id,
        optional: false,
      }),
      reporter: r.one.users({
        from: r.wasteLogs.reportedBy,
        to: r.users.id,
        optional: false,
        alias: "reporter",
      }),
      approver: r.one.users({
        from: r.wasteLogs.approvedBy,
        to: r.users.id,
        alias: "approver",
      }),
    },

    orders: {
      customer: r.one.users({
        from: r.orders.customerId,
        to: r.users.id,
        optional: false,
      }),
      subscription: r.one.subscriptions({
        from: r.orders.subscriptionId,
        to: r.subscriptions.id,
      }),
      items: r.many.orderItems(),
      complaint: r.one.complaints({
        from: r.orders.id,
        to: r.complaints.orderId,
      }),
      payments: r.many.payments(),
    },

    orderItems: {
      order: r.one.orders({
        from: r.orderItems.orderId,
        to: r.orders.id,
        optional: false,
      }),
      product: r.one.products({
        from: r.orderItems.productId,
        to: r.products.id,
        optional: false,
      }),
      allocations: r.many.batchAllocations(),
    },

    batchAllocations: {
      orderItem: r.one.orderItems({
        from: r.batchAllocations.orderItemId,
        to: r.orderItems.id,
        optional: false,
      }),
      batch: r.one.batches({
        from: r.batchAllocations.batchId,
        to: r.batches.id,
        optional: false,
      }),
    },

    subscriptionPlans: {
      subscriptions: r.many.subscriptions(),
    },

    subscriptions: {
      customer: r.one.users({
        from: r.subscriptions.customerId,
        to: r.users.id,
        optional: false,
      }),
      plan: r.one.subscriptionPlans({
        from: r.subscriptions.planId,
        to: r.subscriptionPlans.id,
      }),
      address: r.one.userAddresses({
        from: r.subscriptions.userAddressId,
        to: r.userAddresses.id,
      }),
      orders: r.many.orders(),
      payments: r.many.payments(),
    },

    payments: {
      order: r.one.orders({
        from: r.payments.orderId,
        to: r.orders.id,
      }),
      subscription: r.one.subscriptions({
        from: r.payments.subscriptionId,
        to: r.subscriptions.id,
      }),
      verifier: r.one.users({
        from: r.payments.verifiedBy,
        to: r.users.id,
        alias: "verifier",
      }),
    },

    complaints: {
      order: r.one.orders({
        from: r.complaints.orderId,
        to: r.orders.id,
        optional: false,
      }),
      customer: r.one.users({
        from: r.complaints.customerId,
        to: r.users.id,
        optional: false,
      }),
      resolver: r.one.users({
        from: r.complaints.resolvedBy,
        to: r.users.id,
        alias: "resolver",
      }),
    },
  }),
);
