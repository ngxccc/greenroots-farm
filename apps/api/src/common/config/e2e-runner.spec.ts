import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_E2E_CONCURRENCY,
  discoverE2eTestFiles,
  parseE2eCliArgs,
  resolveE2eConcurrency,
  runE2ePool,
  withRedisWorkerDb,
} from "../../../test/helpers/run-e2e";

describe("TestWorkerRunner", () => {
  describe("parseE2eCliArgs", () => {
    it("parses concurrency flags, filters, and passthrough options", () => {
      expect(parseE2eCliArgs(["--concurrency=4", "auth", "--bail"])).toEqual({
        concurrencyOverride: 4,
        filters: ["auth"],
        passthroughArgs: ["--bail"],
      });

      expect(parseE2eCliArgs(["--concurrency", "2"])).toEqual({
        concurrencyOverride: 2,
        filters: [],
        passthroughArgs: [],
      });
    });

    it("throws on missing or invalid concurrency flag values", () => {
      expect(() => parseE2eCliArgs(["--concurrency"])).toThrow();
      expect(() => parseE2eCliArgs(["--concurrency=0"])).toThrow();
      expect(() => parseE2eCliArgs(["--concurrency", "abc"])).toThrow();
    });
  });

  describe("resolveE2eConcurrency", () => {
    it("defaults to DEFAULT_E2E_CONCURRENCY clamped to host parallelism and Redis slots", () => {
      expect(resolveE2eConcurrency(undefined, undefined, 8)).toBe(
        DEFAULT_E2E_CONCURRENCY,
      );
      expect(resolveE2eConcurrency(10, undefined, 4)).toBe(4);
      expect(resolveE2eConcurrency(32, undefined, 32)).toBe(15);
      expect(resolveE2eConcurrency(undefined, "2", 8)).toBe(2);
    });
  });

  describe("withRedisWorkerDb", () => {
    it("assigns worker-specific logical Redis DB path in 1..15", () => {
      expect(withRedisWorkerDb("redis://localhost:6379", 2)).toBe(
        "redis://localhost:6379/2",
      );
      expect(withRedisWorkerDb("redis://user:pass@localhost:6379/0", 5)).toBe(
        "redis://user:pass@localhost:6379/5",
      );
    });

    it("rejects out-of-range Redis worker slot indices", () => {
      expect(() => withRedisWorkerDb("redis://localhost:6379", 0)).toThrow();
      expect(() => withRedisWorkerDb("redis://localhost:6379", 16)).toThrow();
    });
  });

  describe("discoverE2eTestFiles", () => {
    it("ignores support subdirectories and sorts discovered specs by size descending", () => {
      const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "api-e2e-disc-"));
      try {
        fs.mkdirSync(path.join(tmpRoot, "helpers"), { recursive: true });
        fs.mkdirSync(path.join(tmpRoot, "integration"), { recursive: true });
        fs.writeFileSync(
          path.join(tmpRoot, "helpers", "run-e2e.spec.ts"),
          "// ignored helper",
        );
        fs.writeFileSync(path.join(tmpRoot, "openapi.spec.ts"), "a".repeat(10));
        fs.writeFileSync(
          path.join(tmpRoot, "integration", "auth.spec.ts"),
          "b".repeat(200),
        );

        const files = discoverE2eTestFiles(tmpRoot);
        expect(files).toHaveLength(2);
        expect(files[0]).toContain("auth.spec.ts");
        expect(files[1]).toContain("openapi.spec.ts");
      } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    });
  });

  describe("runE2ePool", () => {
    it("distributes files across bounded worker slots and retains worker failure status", async () => {
      const usedSlots = new Set<number>();
      const results = await runE2ePool(
        ["a.spec.ts", "b.spec.ts", "c.spec.ts", "d.spec.ts"],
        2,
        (filePath, workerSlot) => {
          usedSlots.add(workerSlot);
          return Promise.resolve({
            filePath,
            workerSlot,
            exitCode: filePath === "c.spec.ts" ? 1 : 0,
            stdout: "",
            stderr: "",
            durationMs: 1,
          });
        },
      );

      expect([...usedSlots].sort((a, b) => a - b)).toEqual([1, 2]);
      expect(results).toHaveLength(4);
      expect(
        results.filter((r) => r.exitCode !== 0).map((r) => r.filePath),
      ).toEqual(["c.spec.ts"]);
    });
  });
});
