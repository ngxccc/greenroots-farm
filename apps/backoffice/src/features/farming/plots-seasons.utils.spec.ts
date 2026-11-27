import { describe, expect, it } from "bun:test";
import {
  canDeletePlot,
  canDeletePlotOrSeason,
  canDeleteSeason,
  canTransitionSeasonStatus,
  getActiveSeasonForPlot,
  getNextSeasonStatus,
  validatePlotInput,
  validateSeasonInput,
} from "./plots-seasons.utils";

describe("plots-seasons.utils", () => {
  describe("canDeletePlotOrSeason", () => {
    it("allows delete actions for admin and super_admin roles", () => {
      // Invariant: INV-BO-RBAC-DELETE
      expect(canDeletePlotOrSeason("admin")).toBe(true);
      expect(canDeletePlotOrSeason("super_admin")).toBe(true);
    });

    it("denies delete actions for farm_staff, sales, and undefined roles", () => {
      // Invariant: INV-BO-RBAC-DELETE
      expect(canDeletePlotOrSeason("farm_staff")).toBe(false);
      expect(canDeletePlotOrSeason("sales")).toBe(false);
      expect(canDeletePlotOrSeason(undefined)).toBe(false);
    });
  });

  describe("canDeletePlot", () => {
    it("blocks plot deletion when an active or planning season exists on the plot", () => {
      // Invariant: INV-PLOT-ACTIVE-SEASON-GUARD
      const activeResult = canDeletePlot("plot-1", [
        {
          plotId: "plot-1",
          status: "active",
          seasonName: "Cải ngọt vụ Đông",
        },
      ]);
      expect(activeResult.allowed).toBe(false);
      expect(activeResult.reason).toContain("Cải ngọt vụ Đông");

      const planningResult = canDeletePlot("plot-1", [
        {
          plotId: "plot-1",
          status: "planning",
          seasonName: "Xà lách vụ Xuân",
        },
      ]);
      expect(planningResult.allowed).toBe(false);
      expect(planningResult.reason).toContain("Xà lách vụ Xuân");
    });

    it("allows plot deletion when seasons on the plot are harvested or completed", () => {
      // Invariant: INV-PLOT-ACTIVE-SEASON-GUARD
      const result = canDeletePlot("plot-1", [
        { plotId: "plot-1", status: "harvested", seasonName: "Vụ cũ 1" },
        { plotId: "plot-1", status: "completed", seasonName: "Vụ cũ 2" },
        { plotId: "plot-2", status: "active", seasonName: "Vụ lô khác" },
      ]);
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeNull();
    });
  });

  describe("canDeleteSeason", () => {
    it("allows deletion only when season status is planning", () => {
      expect(canDeleteSeason({ status: "planning" })).toBe(true);
      expect(canDeleteSeason({ status: "active" })).toBe(false);
      expect(canDeleteSeason({ status: "harvested" })).toBe(false);
      expect(canDeleteSeason({ status: "completed" })).toBe(false);
    });
  });

  describe("getNextSeasonStatus", () => {
    it("advances linearly from planning to active to harvested to completed", () => {
      // Invariant: INV-SEASON-LINEAR-LIFECYCLE
      expect(getNextSeasonStatus("planning")).toBe("active");
      expect(getNextSeasonStatus("active")).toBe("harvested");
      expect(getNextSeasonStatus("harvested")).toBe("completed");
      expect(getNextSeasonStatus("completed")).toBeNull();
    });
  });

  describe("canTransitionSeasonStatus", () => {
    it("accepts immediate forward transitions and rejects backward or skipped transitions", () => {
      // Invariant: INV-SEASON-LINEAR-LIFECYCLE
      expect(canTransitionSeasonStatus("planning", "active")).toBe(true);
      expect(canTransitionSeasonStatus("active", "harvested")).toBe(true);
      expect(canTransitionSeasonStatus("harvested", "completed")).toBe(true);

      expect(canTransitionSeasonStatus("planning", "harvested")).toBe(false);
      expect(canTransitionSeasonStatus("planning", "completed")).toBe(false);
      expect(canTransitionSeasonStatus("active", "planning")).toBe(false);
      expect(canTransitionSeasonStatus("completed", "active")).toBe(false);
    });
  });

  describe("getActiveSeasonForPlot", () => {
    it("prefers active season over planning season on the same plot", () => {
      const seasons = [
        {
          id: "s1",
          plotId: "p1",
          seasonName: "Kế hoạch",
          startDate: "2026-10-01",
          expectedHarvestDate: "2026-11-01",
          status: "planning" as const,
          plot: {
            id: "p1",
            plotCode: "A1",
            name: "Lô A1",
            areaSqm: 500,
            deletedAt: null,
          },
          createdAt: "2026-09-01T00:00:00Z",
          updatedAt: "2026-09-01T00:00:00Z",
        },
        {
          id: "s2",
          plotId: "p1",
          seasonName: "Đang trồng",
          startDate: "2026-09-01",
          expectedHarvestDate: "2026-10-01",
          status: "active" as const,
          plot: {
            id: "p1",
            plotCode: "A1",
            name: "Lô A1",
            areaSqm: 500,
            deletedAt: null,
          },
          createdAt: "2026-09-01T00:00:00Z",
          updatedAt: "2026-09-01T00:00:00Z",
        },
      ];

      expect(getActiveSeasonForPlot("p1", seasons)?.id).toBe("s2");
      expect(getActiveSeasonForPlot("p2", seasons)).toBeNull();
    });
  });

  describe("validatePlotInput", () => {
    it("rejects empty plotCode, empty name, or non-positive areaSqm", () => {
      expect(
        validatePlotInput({ plotCode: "", name: "Lô A1", areaSqm: 100 }).valid,
      ).toBe(false);
      expect(
        validatePlotInput({ plotCode: "A1", name: "  ", areaSqm: 100 }).valid,
      ).toBe(false);
      expect(
        validatePlotInput({ plotCode: "A1", name: "Lô A1", areaSqm: 0 }).valid,
      ).toBe(false);
      expect(
        validatePlotInput({ plotCode: "A1", name: "Lô A1", areaSqm: 250 })
          .valid,
      ).toBe(true);
    });
  });

  describe("validateSeasonInput", () => {
    it("rejects when expectedHarvestDate precedes startDate", () => {
      const invalid = validateSeasonInput({
        plotId: "p1",
        seasonName: "Vụ Đông",
        startDate: "2026-10-15",
        expectedHarvestDate: "2026-10-01",
      });
      expect(invalid.valid).toBe(false);

      const valid = validateSeasonInput({
        plotId: "p1",
        seasonName: "Vụ Đông",
        startDate: "2026-10-01",
        expectedHarvestDate: "2026-10-15",
      });
      expect(valid.valid).toBe(true);
    });
  });
});
