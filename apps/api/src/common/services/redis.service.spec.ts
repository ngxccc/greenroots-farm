import { describe, expect, it, beforeEach, afterEach, spyOn } from "bun:test";
import { Logger } from "@nestjs/common";
import { RedisService } from "./redis.service";
import {
  AUTH_REVOCATION_USER_PREFIX,
  AUTH_REVOCATION_TOKEN_PREFIX,
  AUTH_REVOCATION_TTL_SECONDS,
} from "@/common/constants/auth.constant";
import { MESSAGES } from "@/common/constants/messages.constant";

describe("RedisService", () => {
  let service: RedisService;
  let loggerWarnSpy: ReturnType<typeof spyOn>;
  let loggerLogSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    loggerWarnSpy = spyOn(Logger.prototype, "warn").mockImplementation(
      (msg) => {
        void msg;
      },
    );
    loggerLogSpy = spyOn(Logger.prototype, "log").mockImplementation((msg) => {
      void msg;
    });
    service = new RedisService();
  });

  afterEach(async () => {
    loggerWarnSpy.mockRestore();
    loggerLogSpy.mockRestore();
    await service.onModuleDestroy();
  });

  describe("getClient", () => {
    it("returns the underlying Redis instance", () => {
      const client = service.getClient();
      expect(client).toBeDefined();
    });
  });

  describe("isRevoked", () => {
    it("returns false when neither user nor token is revoked", async () => {
      const client = service.getClient();
      const mgetSpy = spyOn(client, "mget").mockResolvedValue([
        null,
        null,
      ] as never);

      const result = await service.isRevoked("user-1", "token-jti-1");

      expect(result).toBe(false);
      expect(mgetSpy).toHaveBeenCalledWith([
        `${AUTH_REVOCATION_USER_PREFIX}user-1`,
        `${AUTH_REVOCATION_TOKEN_PREFIX}token-jti-1`,
      ]);
    });

    it("returns true when user-level revocation key is present", async () => {
      const client = service.getClient();
      spyOn(client, "mget").mockResolvedValue(["1", null] as never);

      const result = await service.isRevoked("user-1", "token-jti-1");

      expect(result).toBe(true);
    });

    it("returns true when token-level revocation key is present", async () => {
      const client = service.getClient();
      spyOn(client, "mget").mockResolvedValue([null, "1"] as never);

      const result = await service.isRevoked("user-1", "token-jti-1");

      expect(result).toBe(true);
    });

    it("returns true when both user and token revocation keys are present", async () => {
      const client = service.getClient();
      spyOn(client, "mget").mockResolvedValue(["1", "1"] as never);

      const result = await service.isRevoked("user-1", "token-jti-1");

      expect(result).toBe(true);
    });

    it("queries only the user key when jti is not provided", async () => {
      const client = service.getClient();
      const mgetSpy = spyOn(client, "mget").mockResolvedValue([null] as never);

      const result = await service.isRevoked("user-1");

      expect(result).toBe(false);
      expect(mgetSpy).toHaveBeenCalledWith([
        `${AUTH_REVOCATION_USER_PREFIX}user-1`,
      ]);
    });

    it("fails open and enters degraded mode when Redis throws an error", async () => {
      const client = service.getClient();
      spyOn(client, "mget").mockRejectedValue(
        new Error("Redis connection timed out"),
      );

      const result = await service.isRevoked("user-1", "token-jti-1");

      expect(result).toBe(false);
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        MESSAGES.AUTH.REDIS_REVOCATION_UNAVAILABLE,
      );
    });

    it("skips network call and fails open during degraded circuit cooldown", async () => {
      const client = service.getClient();
      const mgetSpy = spyOn(client, "mget").mockRejectedValue(
        new Error("Redis down"),
      );

      // Trigger first failure to enter degraded mode
      await service.isRevoked("user-1", "token-jti-1");
      expect(mgetSpy).toHaveBeenCalledTimes(1);

      // Subsequent call during cooldown should return false without calling mget
      const secondResult = await service.isRevoked("user-1", "token-jti-1");
      expect(secondResult).toBe(false);
      expect(mgetSpy).toHaveBeenCalledTimes(1);
    });

    it("recovers from degraded mode upon successful Redis operation", async () => {
      const client = service.getClient();
      const mgetSpy = spyOn(client, "mget").mockRejectedValueOnce(
        new Error("Redis blip"),
      );

      // Trigger degraded mode
      await service.isRevoked("user-1", "token-jti-1");

      // Manually simulate cooldown elapsed
      (service as unknown as { degradedUntil: number }).degradedUntil =
        Date.now() - 1;

      // Now Redis recovers
      mgetSpy.mockResolvedValueOnce([null, null] as never);
      const recoveredResult = await service.isRevoked("user-1", "token-jti-1");

      expect(recoveredResult).toBe(false);
      expect(loggerLogSpy).toHaveBeenCalledWith(
        MESSAGES.AUTH.REDIS_REVOCATION_RECOVERED,
      );
    });
  });

  describe("revokeToken", () => {
    it("skips Redis write when ttlSeconds is zero or negative", async () => {
      const client = service.getClient();
      const setSpy = spyOn(client, "set").mockResolvedValue("OK");

      await service.revokeToken("jti-1", 0);
      await service.revokeToken("jti-2", -10);

      expect(setSpy).not.toHaveBeenCalled();
    });

    it("sets token revocation key in Redis with remaining TTL", async () => {
      const client = service.getClient();
      const setSpy = spyOn(client, "set").mockResolvedValue("OK");

      await service.revokeToken("jti-1", 300.7);

      expect(setSpy).toHaveBeenCalledWith(
        `${AUTH_REVOCATION_TOKEN_PREFIX}jti-1`,
        "1",
        "EX",
        300,
      );
    });

    it("caps token TTL at AUTH_REVOCATION_TTL_SECONDS (900 seconds)", async () => {
      const client = service.getClient();
      const setSpy = spyOn(client, "set").mockResolvedValue("OK");

      await service.revokeToken("jti-1", 3600);

      expect(setSpy).toHaveBeenCalledWith(
        `${AUTH_REVOCATION_TOKEN_PREFIX}jti-1`,
        "1",
        "EX",
        AUTH_REVOCATION_TTL_SECONDS,
      );
    });

    it("handles Redis write failures gracefully without throwing", async () => {
      const client = service.getClient();
      spyOn(client, "set").mockRejectedValue(new Error("Redis write failure"));

      await service.revokeToken("jti-1", 300);
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        MESSAGES.AUTH.REDIS_REVOCATION_UNAVAILABLE,
      );
    });
  });

  describe("revokeUser", () => {
    it("sets user revocation key in Redis with default 900s TTL", async () => {
      const client = service.getClient();
      const setSpy = spyOn(client, "set").mockResolvedValue("OK");

      await service.revokeUser("user-1");

      expect(setSpy).toHaveBeenCalledWith(
        `${AUTH_REVOCATION_USER_PREFIX}user-1`,
        "1",
        "EX",
        AUTH_REVOCATION_TTL_SECONDS,
      );
    });

    it("sets user revocation key with custom TTL", async () => {
      const client = service.getClient();
      const setSpy = spyOn(client, "set").mockResolvedValue("OK");

      await service.revokeUser("user-1", 600);

      expect(setSpy).toHaveBeenCalledWith(
        `${AUTH_REVOCATION_USER_PREFIX}user-1`,
        "1",
        "EX",
        600,
      );
    });

    it("handles Redis write failures gracefully without throwing", async () => {
      const client = service.getClient();
      spyOn(client, "set").mockRejectedValue(new Error("Redis write failure"));

      await service.revokeUser("user-1");
      expect(loggerWarnSpy).toHaveBeenCalledWith(
        MESSAGES.AUTH.REDIS_REVOCATION_UNAVAILABLE,
      );
    });
  });

  describe("deprecated aliases", () => {
    it("forwards isAccessTokenRevoked to isRevoked", async () => {
      const isRevokedSpy = spyOn(service, "isRevoked").mockResolvedValue(true);

      interface LegacyService {
        isAccessTokenRevoked(id: string): Promise<boolean>;
        revokeAccessToken(id: string, ttl: number): Promise<void>;
      }
      const legacyService = service as unknown as LegacyService;
      const result = await legacyService.isAccessTokenRevoked("user-1");

      expect(result).toBe(true);
      expect(isRevokedSpy).toHaveBeenCalledWith("user-1");
    });

    it("forwards revokeAccessToken to revokeUser", async () => {
      const revokeUserSpy = spyOn(service, "revokeUser").mockResolvedValue();

      interface LegacyService {
        isAccessTokenRevoked(id: string): Promise<boolean>;
        revokeAccessToken(id: string, ttl: number): Promise<void>;
      }
      const legacyService = service as unknown as LegacyService;
      await legacyService.revokeAccessToken("user-1", 600);

      expect(revokeUserSpy).toHaveBeenCalledWith("user-1", 600);
    });
  });

  describe("onModuleDestroy", () => {
    it("quits the Redis client gracefully", async () => {
      const client = service.getClient();
      const quitSpy = spyOn(client, "quit").mockResolvedValue("OK");

      await service.onModuleDestroy();

      expect(quitSpy).toHaveBeenCalled();
    });

    it("falls back to disconnect when quit throws", async () => {
      const client = service.getClient();
      spyOn(client, "quit").mockRejectedValue(new Error("Connection reset"));
      const disconnectSpy = spyOn(client, "disconnect").mockImplementation(
        () => {
          return;
        },
      );

      await service.onModuleDestroy();

      expect(disconnectSpy).toHaveBeenCalled();
    });
  });
});
