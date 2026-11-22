import { describe, expect, it } from "bun:test";
import { parseRedisOptions } from "./redis.config";

describe("parseRedisOptions", () => {
  describe("logical database extraction", () => {
    it("omits db when REDIS_URL has no database path", () => {
      const config = parseRedisOptions("redis://localhost:6379");

      expect(config.host).toBe("localhost");
      expect(config.port).toBe(6379);
      expect(config.db).toBeUndefined();
    });

    it("extracts trailing logical database index within 0..15", () => {
      expect(parseRedisOptions("redis://localhost:6379/0").db).toBe(0);
      expect(parseRedisOptions("redis://localhost:6379/3").db).toBe(3);
      expect(parseRedisOptions("redis://localhost:6379/15").db).toBe(15);
    });

    it("ignores non-numeric or out-of-range database paths", () => {
      expect(parseRedisOptions("redis://localhost:6379/16").db).toBeUndefined();
      expect(
        parseRedisOptions("redis://localhost:6379/abc").db,
      ).toBeUndefined();
      expect(
        parseRedisOptions("redis://localhost:6379/1/2").db,
      ).toBeUndefined();
      expect(parseRedisOptions("redis://localhost:6379/").db).toBeUndefined();
    });

    it("preserves TLS and credentials alongside logical database index", () => {
      const config = parseRedisOptions(
        "rediss://default:secret@redis.example.com:6380/2",
      );

      expect(config.host).toBe("redis.example.com");
      expect(config.port).toBe(6380);
      expect(config.db).toBe(2);
      expect(config.username).toBe("default");
      expect(config.password).toBe("secret");
      expect(config.tls).toEqual({
        rejectUnauthorized: false,
        servername: "redis.example.com",
      });
    });

    it("falls back to local defaults when REDIS_URL is malformed or missing", () => {
      expect(parseRedisOptions(undefined)).toEqual({
        host: "localhost",
        port: 6379,
        maxRetriesPerRequest: null,
      });
      expect(parseRedisOptions("not-a-valid-url")).toEqual({
        host: "localhost",
        port: 6379,
        maxRetriesPerRequest: null,
      });
    });
  });
});
