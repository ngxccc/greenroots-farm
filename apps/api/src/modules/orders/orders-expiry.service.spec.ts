import { beforeEach, describe, expect, it, mock } from "bun:test";
import { env } from "@/common/config/env.config";
import type { SubscriptionsService } from "@/modules/subscriptions/subscriptions.service";
import { EXPIRY_SWEEP_INTERVAL_MS } from "./orders.constant";
import { OrdersExpiryService } from "./orders-expiry.service";
import type { OrdersService } from "./orders.service";

describe("OrdersExpiryService", () => {
  let expireOrderReservationsMock: ReturnType<typeof mock>;
  let expireSubscriptionReservationsMock: ReturnType<typeof mock>;
  let service: OrdersExpiryService;

  beforeEach(() => {
    expireOrderReservationsMock = mock(() => Promise.resolve(0));
    expireSubscriptionReservationsMock = mock(() => Promise.resolve(0));
    service = new OrdersExpiryService(
      {
        expireStaleReservations: expireOrderReservationsMock,
      } as unknown as OrdersService,
      {
        expireStaleReservations: expireSubscriptionReservationsMock,
      } as unknown as SubscriptionsService,
    );
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
      expireOrderReservationsMock.mockImplementationOnce(
        () =>
          new Promise<number>((resolve) => {
            resolveFirst = resolve;
          }),
      );

      const firstRun = service.runSweep();
      const overlappingResult = await service.runSweep();

      expect(overlappingResult).toBe(0);
      expect(expireOrderReservationsMock).toHaveBeenCalledTimes(1);

      resolveFirst(2);
      expect(await firstRun).toBe(2);
    });

    // Invariant: INV-EXP-4
    it("isolates order sweep failures from subscription sweep and sums expired counts", async () => {
      const errorMock = mock(() => undefined);
      (
        service as unknown as { logger: { error: typeof errorMock } }
      ).logger.error = errorMock;
      expireOrderReservationsMock.mockRejectedValueOnce(
        new Error("Database connection lost"),
      );
      expireSubscriptionReservationsMock.mockResolvedValueOnce(2);

      const partialResult = await service.runSweep();

      expect(partialResult).toBe(2);
      expect(errorMock).toHaveBeenCalledTimes(1);

      expireOrderReservationsMock.mockResolvedValueOnce(1);
      expireSubscriptionReservationsMock.mockResolvedValueOnce(3);
      expect(await service.runSweep()).toBe(4);
    });
  });
});
