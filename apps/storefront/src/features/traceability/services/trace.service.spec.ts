import { describe, expect, it } from "bun:test";
import { API_ERROR_CODES, BatchStatus, SeasonStatus } from "@greenroots/shared";
import {
  fetchRecentTraceBatches,
  fetchTraceByBatchCode,
} from "@/features/traceability/services/trace.service";
import type {
  RecentTraceBatchItem,
  TraceRecord,
} from "@/features/traceability/types/trace.types";

const sampleRecentItem: RecentTraceBatchItem = {
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
};

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
    imageUrls: [],
  },
  farm: {
    name: "GreenRoots Farm",
    legalName: "Công ty TNHH GreenRoots",
    tagline: null,
    address: "Củ Chi, TP.HCM",
    certificationUrl: null,
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

describe("trace.service", () => {
  describe("fetchRecentTraceBatches", () => {
    it("returns recent batches when API responds with data", async () => {
      const items = await fetchRecentTraceBatches(4, {
        fetchRecent: () =>
          Promise.resolve({
            data: { data: [sampleRecentItem] },
          }),
      });

      expect(items).toEqual([sampleRecentItem]);
    });

    it("degrades to an empty array when the API request fails", async () => {
      const items = await fetchRecentTraceBatches(4, {
        fetchRecent: () => Promise.reject(new Error("ECONNREFUSED")),
      });

      expect(items).toEqual([]);
    });
  });

  describe("fetchTraceByBatchCode", () => {
    it("normalizes batch code and returns trace record on success", async () => {
      let requestedCode = "";
      const result = await fetchTraceByBatchCode("  batch-2026-tom-01  ", {
        fetchByBatchCode: (code) => {
          requestedCode = code;
          return Promise.resolve({ data: { data: sampleTraceRecord } });
        },
      });

      expect(requestedCode).toBe("BATCH-2026-TOM-01");
      expect(result).toEqual({ ok: true, data: sampleTraceRecord });
    });

    it("returns not_found when the batch code is missing or invalid", async () => {
      const result = await fetchTraceByBatchCode("BATCH-MISSING", {
        fetchByBatchCode: () =>
          Promise.resolve({
            response: { status: 404 },
            error: { code: API_ERROR_CODES.BATCH_NOT_FOUND },
          }),
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("not_found");
      }
    });

    it("returns error when the traceability service throws or fails", async () => {
      const result = await fetchTraceByBatchCode("BATCH-2026-TOM-01", {
        fetchByBatchCode: () => Promise.reject(new Error("Network down")),
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("error");
      }
    });
  });
});
