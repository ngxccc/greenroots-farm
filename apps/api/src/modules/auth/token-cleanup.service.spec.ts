import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { createMockDb } from "../../../test/mocks/mock-database";
import { TokenCleanupService } from "./token-cleanup.service";

describe("TokenCleanupService", () => {
  let service: TokenCleanupService;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
    service = new TokenCleanupService(mockDb);
  });

  describe("Lifecycle Hooks", () => {
    it("should instantiate TokenCleanupService correctly", () => {
      expect(service).toBeDefined();
    });

    it("should register interval timer and trigger initial cleanup when onApplicationBootstrap is called", () => {
      const originalSetInterval = globalThis.setInterval;
      const setIntervalMock = mock((cb: () => void) => {
        cb();
        return {
          unref: mock(() => undefined),
        } as unknown as ReturnType<typeof setInterval>;
      });
      globalThis.setInterval = setIntervalMock as unknown as typeof setInterval;

      const cleanupSpy = spyOn(service, "cleanupTokens").mockImplementation(
        () => Promise.resolve(),
      );

      try {
        service.onApplicationBootstrap();
        expect(setIntervalMock).toHaveBeenCalledTimes(1);
        expect(cleanupSpy).toHaveBeenCalled();
      } finally {
        globalThis.setInterval = originalSetInterval;
        cleanupSpy.mockRestore();
      }
    });

    it("should clear active interval timer when onApplicationShutdown is called", () => {
      const originalClearInterval = globalThis.clearInterval;
      const clearIntervalMock = mock(() => undefined);
      globalThis.clearInterval = clearIntervalMock;

      try {
        service.onApplicationShutdown();
        expect(clearIntervalMock).toHaveBeenCalledTimes(0); // timer was null initially

        // Set timer and test clearing
        (service as unknown as { timer: unknown }).timer = 123;
        service.onApplicationShutdown();
        expect(clearIntervalMock).toHaveBeenCalledTimes(1);
      } finally {
        globalThis.clearInterval = originalClearInterval;
      }
    });
  });

  describe("cleanupTokens", () => {
    it("should execute database delete with expiration filter", async () => {
      await service.cleanupTokens();
      expect(mockDb.delete).toHaveBeenCalledTimes(1);
    });

    it("should catch and log database errors gracefully without throwing", async () => {
      const errorMock = mock(() => undefined);
      (
        service as unknown as { logger: { error: typeof errorMock } }
      ).logger.error = errorMock;

      mockDb.delete = mock(() => ({
        where: mock(() =>
          Promise.reject(new Error("Database connection dropped")),
        ),
      })) as unknown as typeof mockDb.delete;

      await service.cleanupTokens();
      expect(errorMock).toHaveBeenCalledTimes(1);
    });
  });
});
