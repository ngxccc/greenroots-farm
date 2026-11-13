import { describe, expect, test } from "bun:test";
import { SEED_DATES, seedDate, seedTimestamp } from "./seed-dates.constant";

function expectedDate(offsetDays: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

describe("seedDate", () => {
  test("offsets from the current UTC day", () => {
    expect(seedDate(0)).toBe(expectedDate(0));
    expect(seedDate(-8)).toBe(expectedDate(-8));
    expect(seedDate(6)).toBe(expectedDate(6));
  });

  test("keeps demo batches and subscription windows ordered", () => {
    expect(SEED_DATES.tomatoExpiry > SEED_DATES.tomatoHarvest).toBe(true);
    expect(SEED_DATES.spinachExpiry > SEED_DATES.spinachHarvest).toBe(true);
    expect(SEED_DATES.lettuceExpiry > SEED_DATES.lettuceHarvest).toBe(true);
    expect(SEED_DATES.subscriptionEnd > SEED_DATES.subscriptionStart).toBe(
      true,
    );
  });
});

describe("seedTimestamp", () => {
  test("applies the requested UTC time", () => {
    const timestamp = seedTimestamp(-1, 3, 15);

    expect(timestamp.getUTCHours()).toBe(3);
    expect(timestamp.getUTCMinutes()).toBe(15);
  });
});
