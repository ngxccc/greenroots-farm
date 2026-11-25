import { describe, expect, it } from "bun:test";
import { BatchStatus, SeasonStatus } from "@greenroots/shared";
import {
  isSafeExternalCertUrl,
  toRecentTracePreview,
} from "@/features/traceability/utils/trace-mapper";
import type { TraceRecord } from "@/features/traceability/types/trace.types";

const sampleTraceRecord: TraceRecord = {
  batch: {
    id: "019fa8bc-8f4d-7000-b366-e691f45cfb90",
    batchCode: "BATCH-2026-TOM-01",
    harvestDate: "2026-11-20T04:15:00.000Z",
    expirationDate: "2026-11-29T04:15:00.000Z",
    status: BatchStatus.IN_STOCK,
  },
  product: {
    id: "019fa8bc-8f4d-7000-b366-e691f45cfb91",
    name: "Cà chua bi hữu cơ",
    slug: "ca-chua-bi-huu-co",
    unit: "500g",
    imageUrls: ["https://res.cloudinary.com/demo/tom.jpg"],
  },
  farm: {
    name: "GreenRoots Farm",
    legalName: "Công ty TNHH GreenRoots",
    tagline: null,
    address: "Củ Chi, TP.HCM",
    certificationUrl: "https://greenroots.farm/cert.pdf",
  },
  plot: {
    plotCode: "PLOT-B2",
    name: "Nhà màng B2, Củ Chi",
    areaSqm: 1200,
    soilTestResult: null,
    waterTestResult: null,
  },
  season: {
    id: "019fa8bc-8f4d-7000-b366-e691f45cfb92",
    seasonName: "Vụ Đông Xuân 2026",
    startDate: "2026-09-01",
    expectedHarvestDate: "2026-12-15",
    status: SeasonStatus.HARVESTED,
  },
  farmingLogs: [],
  totalLogCount: 0,
  logsTruncated: false,
};

describe("Traceability Mappers", () => {
  describe("toRecentTracePreview", () => {
    it("projects a full trace record into a compact preview item", () => {
      expect(toRecentTracePreview(sampleTraceRecord)).toEqual({
        batchCode: "BATCH-2026-TOM-01",
        harvestDate: "2026-11-20T04:15:00.000Z",
        status: BatchStatus.IN_STOCK,
        product: {
          name: "Cà chua bi hữu cơ",
          unit: "500g",
          imageUrls: ["https://res.cloudinary.com/demo/tom.jpg"],
        },
        plot: {
          plotCode: "PLOT-B2",
          name: "Nhà màng B2, Củ Chi",
        },
      });
    });
  });

  describe("isSafeExternalCertUrl", () => {
    it("accepts only HTTPS URLs and rejects javascript or http schemes", () => {
      expect(isSafeExternalCertUrl("https://greenroots.farm/cert.pdf")).toBe(
        true,
      );
      expect(isSafeExternalCertUrl("http://greenroots.farm/cert.pdf")).toBe(
        false,
      );
      expect(isSafeExternalCertUrl("javascript:alert(1)")).toBe(false);
      expect(isSafeExternalCertUrl("not-a-url")).toBe(false);
    });
  });
});
