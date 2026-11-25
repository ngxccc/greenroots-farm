import { beforeEach, describe, expect, it, mock } from "bun:test";
import { env } from "@/common/config/env.config";
import { EXPIRY_SWEEP_INTERVAL_MS } from "./orders.constant";
import { OrdersExpiryService } from "./orders-expiry.service";
import type { OrdersService } from "./orders.service";

describe("OrdersExpiryService", () => {
  let expireStaleReservationsMock: ReturnType<typeof mock>;
  let service: OrdersExpiryService;

  beforeEach(() => {
    expireStaleReservationsMock = mock(() => Promise.resolve(0));
    service = new OrdersExpiryService({
      expireStaleReservations: expireStaleReservationsMock,
    } as unknown as OrdersService);
  });

  describe("onModuleInit", () => {
    // Invariant: INV-ORD-22
    it("suppresses the interval scheduler when NODE_ENV is test", () => {
      const originalSetInterval = globalThis.setInterval;
      const setIntervalMock = mock(() => ({
        unref: mock(() => undefined),
      }));
      globalThis.setInterval = setIntervalMock as unknown as typeof setInterval;

      try {
        expect(env.NODE_ENV).toBe("test");
        service.onModuleInit();
        expect(setIntervalMock).not.toHaveBeenCalled();
      } finally {
        globalThis.setInterval = originalSetInterval;
      }
    });

    it("registers an unrefed interval scheduler outside test environment", () => {
      const originalEnv = env.NODE_ENV;
      const originalSetInterval = globalThis.setInterval;
      const unrefMock = mock(() => undefined);
      const setIntervalMock = mock(() => ({
        unref: unrefMock,
      }));
      (env as { NODE_ENV: string }).NODE_ENV = "production";
      globalThis.setInterval = setIntervalMock as unknown as typeof setInterval;

      try {
        service.onModuleInit();
        expect(setIntervalMock).toHaveBeenCalledTimes(1);
        expect(setIntervalMock).toHaveBeenCalledWith(
          expect.any(Function),
          EXPIRY_SWEEP_INTERVAL_MS,
        );
        expect(unrefMock).toHaveBeenCalledTimes(1);
      } finally {
        service.onModuleDestroy();
        globalThis.setInterval = originalSetInterval;
        (env as { NODE_ENV: string }).NODE_ENV = originalEnv;
      }
    });
  });

  describe("onModuleDestroy", () => {
    it("clears the active interval timer when destroyed", () => {
      const originalEnv = env.NODE_ENV;
      const originalSetInterval = globalThis.setInterval;
      const originalClearInterval = globalThis.clearInterval;
      const fakeTimer = { unref: mock(() => undefined) };
      const clearIntervalMock = mock(() => undefined);

      (env as { NODE_ENV: string }).NODE_ENV = "development";
      globalThis.setInterval = mock(
        () => fakeTimer,
      ) as unknown as typeof setInterval;
      globalThis.clearInterval = clearIntervalMock;

      try {
        service.onModuleInit();
        service.onModuleDestroy();
        expect(clearIntervalMock).toHaveBeenCalledWith(fakeTimer);
      } finally {
        globalThis.setInterval = originalSetInterval;
        globalThis.clearInterval = originalClearInterval;
        (env as { NODE_ENV: string }).NODE_ENV = originalEnv;
      }
    });
  });

  describe("runSweep", () => {
    it("skips overlapping runs while a sweep is already in progress", async () => {
      let resolveFirst!: (value: number) => void;
      expireStaleReservationsMock.mockImplementationOnce(
        () =>
          new Promise<number>((resolve) => {
            resolveFirst = resolve;
          }),
      );

      const firstRun = service.runSweep();
      const overlappingResult = await service.runSweep();

      expect(overlappingResult).toBe(0);
      expect(expireStaleReservationsMock).toHaveBeenCalledTimes(1);

      resolveFirst(2);
      expect(await firstRun).toBe(2);
    });

    it("logs and returns zero when the sweep throws an error", async () => {
      const errorMock = mock(() => undefined);
      (
        service as unknown as { logger: { error: typeof errorMock } }
      ).logger.error = errorMock;
      expireStaleReservationsMock.mockRejectedValueOnce(
        new Error("Database connection lost"),
      );

      const result = await service.runSweep();

      expect(result).toBe(0);
      expect(errorMock).toHaveBeenCalledTimes(1);

      expireStaleReservationsMock.mockResolvedValueOnce(1);
      expect(await service.runSweep()).toBe(1);
    });
  });
});
