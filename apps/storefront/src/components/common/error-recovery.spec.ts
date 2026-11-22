import { describe, expect, it } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import StorefrontErrorPage from "../../../app/error";
import { renderMaintenanceRoute } from "../../../app/maintenance/page";
import { classifyClientIncident } from "./system-incident-view";

describe("Storefront Error Boundaries", () => {
  describe("StorefrontErrorPage", () => {
    it("omits sensitive error messages and stack traces while preserving server digest", () => {
      // Invariant: INV-SF-ERR-1
      const leakedSecret = "postgresql://secret-db-host:5432/internal";
      const clientError = Object.assign(new Error(leakedSecret), {
        digest: "DIGEST-9981",
        stack: `Error: ${leakedSecret}\n    at secretHandler`,
      });

      const html = renderToStaticMarkup(
        createElement(StorefrontErrorPage, {
          error: clientError,
          reset: () => undefined,
        }),
      );

      expect(html).toContain("DIGEST-9981");
      expect(html).not.toContain(leakedSecret);
      expect(html).not.toContain("secretHandler");
    });
  });

  describe("classifyClientIncident", () => {
    it("maps numeric access and unavailability statuses to dedicated variants", () => {
      expect(classifyClientIncident({ status: 403 })).toBe("403");
      expect(classifyClientIncident({ status: 503 })).toBe("maintenance");
      expect(classifyClientIncident({ status: 500 })).toBe("500");
      expect(classifyClientIncident(new Error("boom"))).toBe("500");
    });
  });

  describe("renderMaintenanceRoute", () => {
    it("invokes notFound handler when maintenance mode is inactive and renders view when active", async () => {
      // Invariant: INV-SF-ERR-4
      class NotFoundInterrupt extends Error {}
      let notFoundCalls = 0;
      let caught: unknown;

      try {
        await renderMaintenanceRoute({
          checkConnection: () => Promise.resolve(),
          isEnabled: () => false,
          onNotFound: () => {
            notFoundCalls++;
            throw new NotFoundInterrupt("NEXT_NOT_FOUND");
          },
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(NotFoundInterrupt);
      expect(notFoundCalls).toBe(1);

      const element = await renderMaintenanceRoute({
        checkConnection: () => Promise.resolve(),
        isEnabled: () => true,
      });
      expect(element).toBeDefined();
    });
  });
});
