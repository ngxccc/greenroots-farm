import { describe, expect, it } from "bun:test";
import {
  LOG_LEVELS,
  MAIL_DRIVERS,
  NODE_ENVIRONMENTS,
  PAYMENT_DRIVERS,
  resolveLogLevels,
  type ApiLogLevel,
} from "./environment.constant";

describe("environment.constant", () => {
  describe("runtime constants", () => {
    it("defines the expected NODE_ENVIRONMENTS", () => {
      expect(NODE_ENVIRONMENTS).toEqual(["development", "production", "test"]);
    });

    it("defines the expected LOG_LEVELS ordered by severity", () => {
      expect(LOG_LEVELS).toEqual([
        "fatal",
        "error",
        "warn",
        "log",
        "debug",
        "verbose",
      ]);
    });

    it("defines the expected MAIL_DRIVERS", () => {
      expect(MAIL_DRIVERS).toEqual(["resend", "mock"]);
    });

    it("defines the expected PAYMENT_DRIVERS", () => {
      expect(PAYMENT_DRIVERS).toEqual(["payos", "mock"]);
    });
  });

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
