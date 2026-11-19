import { describe, expect, it } from "bun:test";
import { resolveLogLevels, type ApiLogLevel } from "./environment.constant";

describe("environment.constant", () => {
  describe("resolveLogLevels", () => {
    it("returns fatal-only when level is fatal", () => {
      expect(resolveLogLevels("fatal")).toEqual(["fatal"]);
    });

    it("returns fatal and error when level is error", () => {
      expect(resolveLogLevels("error")).toEqual(["fatal", "error"]);
    });

    it("returns up to warn when level is warn", () => {
      expect(resolveLogLevels("warn")).toEqual(["fatal", "error", "warn"]);
    });

    it("returns up to log when level is log", () => {
      expect(resolveLogLevels("log")).toEqual([
        "fatal",
        "error",
        "warn",
        "log",
      ]);
    });

    it("returns up to debug when level is debug", () => {
      expect(resolveLogLevels("debug")).toEqual([
        "fatal",
        "error",
        "warn",
        "log",
        "debug",
      ]);
    });

    it("returns all levels when level is verbose", () => {
      expect(resolveLogLevels("verbose")).toEqual([
        "fatal",
        "error",
        "warn",
        "log",
        "debug",
        "verbose",
      ]);
    });

    it("falls back to debug window when an unrecognized level is supplied", () => {
      expect(resolveLogLevels("unknown" as unknown as ApiLogLevel)).toEqual([
        "fatal",
        "error",
        "warn",
        "log",
        "debug",
      ]);
    });
  });
});
