export interface SeedSummary {
  farms: number;
  users: number;
  plots: number;
  seasons: number;
  categories: number;
  products: number;
  batches: number;
  farmingLogs: number;
  wasteLogs: number;
  subscriptionPlans: number;
  userAddresses: number;
  orders: number;
  orderItems: number;
  batchAllocations: number;
  subscriptions: number;
  payments: number;
  complaints: number;
  durationMs: number;
}

export interface SeedOptions {
  clean?: boolean;
}
