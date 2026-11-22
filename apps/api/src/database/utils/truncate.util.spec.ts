import { describe, expect, it, mock } from "bun:test";
import type { DrizzleDB } from "@/database/database.module";
import { truncateAllTables } from "./truncate.util";

describe("truncateAllTables", () => {
  describe("table cache and isolation", () => {
    it("caches resolved schema tables across repeated calls on the same database client", async () => {
      let callCount = 0;
      const execute = mock(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            rows: [
              { tablename: "__drizzle_migrations" },
              { tablename: "users" },
              { tablename: "orders" },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });
      const db = { execute } as unknown as DrizzleDB;

      await truncateAllTables(db, "test_worker_1");
      await truncateAllTables(db, "test_worker_1");

      expect(execute).toHaveBeenCalledTimes(3);
    });

    it("isolates cached table lists per database client instance", async () => {
      const executeA = mock(() =>
        Promise.resolve({ rows: [{ tablename: "users" }] }),
      );
      const executeB = mock(() =>
        Promise.resolve({ rows: [{ tablename: "products" }] }),
      );
      const dbA = { execute: executeA } as unknown as DrizzleDB;
      const dbB = { execute: executeB } as unknown as DrizzleDB;

      await truncateAllTables(dbA, "public");
      await truncateAllTables(dbB, "public");

      expect(executeA).toHaveBeenCalledTimes(2);
      expect(executeB).toHaveBeenCalledTimes(2);
    });

    it("skips truncation when a schema contains only migration metadata", async () => {
      const execute = mock(() =>
        Promise.resolve({ rows: [{ tablename: "__drizzle_migrations" }] }),
      );
      const db = { execute } as unknown as DrizzleDB;

      await truncateAllTables(db, "empty_schema");
      await truncateAllTables(db, "empty_schema");

      expect(execute).toHaveBeenCalledTimes(2);
    });
  });
});
