const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Returns a `YYYY-MM-DD` date offset from today in UTC.
 *
 * Seeds must stay valid whenever they run: relative dates keep batches fresh
 * and subscriptions current instead of expiring on a hardcoded calendar day.
 */
export function seedDate(offsetDays: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

/** Returns a stable UTC timestamp offset from today by whole days. */
export function seedTimestamp(
  offsetDays: number,
  hourUtc = 0,
  minuteUtc = 0,
): Date {
  const date = new Date(Date.now() + offsetDays * MS_PER_DAY);
  date.setUTCHours(hourUtc, minuteUtc, 0, 0);
  return date;
}

/** Relative calendar dates used by the demo dataset. */
export const SEED_DATES = {
  tomatoHarvest: seedDate(-8),
  tomatoExpiry: seedDate(6),
  spinachHarvest: seedDate(-5),
  spinachExpiry: seedDate(3),
  lettuceHarvest: seedDate(-4),
  lettuceExpiry: seedDate(2),
  subscriptionStart: seedDate(-1),
  subscriptionEnd: seedDate(27),
} as const;

/** Relative timestamps used by the demo dataset. */
export const SEED_TIMESTAMPS = {
  farmingSeeding: seedTimestamp(-72, 1, 30),
  farmingHarvest: seedTimestamp(-8, 23, 0),
  subscriptionPaidAt: seedTimestamp(-1, 3, 15),
} as const;
