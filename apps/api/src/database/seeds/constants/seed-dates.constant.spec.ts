import { describe, expect, test } from "bun:test";
import {
  SEED_DATES,
  SEED_TIMESTAMPS,
  seedDate,
  seedTimestamp,
} from "./seed-dates.constant";

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
    expect(SEED_TIMESTAMPS.tomatoExpiry > SEED_TIMESTAMPS.tomatoHarvest).toBe(
      true,
    );
    expect(SEED_TIMESTAMPS.spinachExpiry > SEED_TIMESTAMPS.spinachHarvest).toBe(
      true,
    );
    expect(SEED_TIMESTAMPS.lettuceExpiry > SEED_TIMESTAMPS.lettuceHarvest).toBe(
      true,
    );
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
