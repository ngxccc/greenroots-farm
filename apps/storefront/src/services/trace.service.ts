import {
  BatchStatus,
  FarmingActionType,
  SeasonStatus,
} from "@greenroots/shared";
import type { BatchTraceRecord } from "@/types/trace.types";

// TODO(farms-api): Wire GET /api/v1/farms/trace/:batchCode once FarmsModule controller lands.
const SHOWCASE_TRACE_RECORDS: Record<string, BatchTraceRecord> = {
  "BATCH-2026-TOM-01": {
    batchCode: "BATCH-2026-TOM-01",
    productName: "Cà chua bi hữu cơ",
    unitLabel: "500g",
    harvestDate: "2026-11-20",
    expirationDate: "2026-11-29",
    status: BatchStatus.IN_STOCK,
    plotCode: "PLOT-B2",
    plotName: "Lô B2 - Nhà kính Đơn Dương, Lâm Đồng",
    areaSqm: 1200,
    seasonName: "Vụ Đông Xuân 2026 - Cà Chua Bi",
    seasonStatus: SeasonStatus.ACTIVE,
    soilPh: 6.4,
    waterPh: 7.1,
    heavyMetalsPass: true,
    certificationUrl: "https://greenroots.farm/xet-nghiem/dat-b2.pdf",
    farmingLogs: [
      {
        id: "log-1",
        actionType: FarmingActionType.SEEDING,
        description:
          "Xuống giống cà chua bi hữu cơ F1 trên giá thể xơ dừa đã xử lý vi sinh.",
        mediaUrls: [],
        loggedAt: "2026-09-01T01:30:00.000Z",
        engineerName: "Kỹ sư Lê Văn Canh Tác",
      },
      {
        id: "log-2",
        actionType: FarmingActionType.BIO_FERTILIZING,
        description:
          "Bón thúc phân trùn quế kết hợp dịch chuối ủ men vi sinh định kỳ tuần 4.",
        mediaUrls: [],
        loggedAt: "2026-10-02T02:15:00.000Z",
        engineerName: "Kỹ sư Lê Văn Canh Tác",
      },
      {
        id: "log-3",
        actionType: FarmingActionType.HARVESTING,
        description:
          "Thu hoạch thủ công lúc 15h chiều đạt độ chín 90%, làm lạnh sơ bộ 4°C và đóng xe lạnh đêm về TP.HCM.",
        mediaUrls: [],
        loggedAt: "2026-11-20T21:00:00.000Z",
        engineerName: "Kỹ sư Lê Văn Canh Tác",
      },
    ],
  },
  "LOT-DL-2604-A1": {
    batchCode: "LOT-DL-2604-A1",
    productName: "Cải bó xôi hữu cơ",
    unitLabel: "300g",
    harvestDate: "2026-11-21",
    expirationDate: "2026-11-25",
    status: BatchStatus.IN_STOCK,
    plotCode: "PLOT-A1",
    plotName: "Lô A1 - Nhà kính Đơn Dương, Lâm Đồng",
    areaSqm: 900,
    seasonName: "Vụ Đông Xuân 2026 - Cải Bó Xôi",
    seasonStatus: SeasonStatus.ACTIVE,
    soilPh: 6.5,
    waterPh: 7.0,
    heavyMetalsPass: true,
    certificationUrl: "https://greenroots.farm/xet-nghiem/dat-a1.pdf",
    farmingLogs: [
      {
        id: "log-a1-1",
        actionType: FarmingActionType.SEEDING,
        description:
          "Gieo hạt cải bó xôi hữu cơ trên luống phủ màng sinh học thoáng khí.",
        mediaUrls: [],
        loggedAt: "2026-10-15T01:00:00.000Z",
        engineerName: "Kỹ sư Nguyễn Minh Thảo",
      },
      {
        id: "log-a1-2",
        actionType: FarmingActionType.HARVESTING,
        description:
          "Thu hoạch chiều mát lúc 15h30 khi lá đạt độ giòn ngọt chuẩn VietGAP, đóng sọt đi xe lạnh đêm.",
        mediaUrls: [],
        loggedAt: "2026-11-21T21:30:00.000Z",
        engineerName: "Kỹ sư Nguyễn Minh Thảo",
      },
    ],
  },
  "LOT-CC-2604-C1": {
    batchCode: "LOT-CC-2604-C1",
    productName: "Cải xoăn Kale hữu cơ",
    unitLabel: "250g",
    harvestDate: "2026-11-21",
    expirationDate: "2026-11-26",
    status: BatchStatus.IN_STOCK,
    plotCode: "PLOT-C1",
    plotName: "Lô C1 - Vườn đồi Lạc Dương, Lâm Đồng",
    areaSqm: 1100,
    seasonName: "Vụ Đông Xuân 2026 - Cải Xoăn Kale",
    seasonStatus: SeasonStatus.ACTIVE,
    soilPh: 6.3,
    waterPh: 6.9,
    heavyMetalsPass: true,
    certificationUrl: "https://greenroots.farm/xet-nghiem/dat-c1.pdf",
    farmingLogs: [
      {
        id: "log-c1-1",
        actionType: FarmingActionType.BIO_FERTILIZING,
        description:
          "Bổ sung phân hữu cơ hoai mục và vi sinh đối kháng bảo vệ bộ rễ.",
        mediaUrls: [],
        loggedAt: "2026-10-25T02:00:00.000Z",
        engineerName: "Kỹ sư Lê Văn Canh Tác",
      },
      {
        id: "log-c1-2",
        actionType: FarmingActionType.HARVESTING,
        description:
          "Tỉa lá cải xoăn Kale tuyển chọn lúc 16h chiều và làm mát tức thì ở 4°C.",
        mediaUrls: [],
        loggedAt: "2026-11-21T21:45:00.000Z",
        engineerName: "Kỹ sư Lê Văn Canh Tác",
      },
    ],
  },
  "LOT-DL-2604-D2": {
    batchCode: "LOT-DL-2604-D2",
    productName: "Cà rốt hữu cơ Đà Lạt",
    unitLabel: "500g",
    harvestDate: "2026-11-21",
    expirationDate: "2026-12-01",
    status: BatchStatus.IN_STOCK,
    plotCode: "PLOT-D2",
    plotName: "Lô D2 - Đất đỏ bazan Đơn Dương, Lâm Đồng",
    areaSqm: 1500,
    seasonName: "Vụ Đông Xuân 2026 - Cà Rốt",
    seasonStatus: SeasonStatus.ACTIVE,
    soilPh: 6.6,
    waterPh: 7.1,
    heavyMetalsPass: true,
    certificationUrl: "https://greenroots.farm/xet-nghiem/dat-d2.pdf",
    farmingLogs: [
      {
        id: "log-d2-1",
        actionType: FarmingActionType.SOIL_TESTING,
        description:
          "Kiểm định mẫu đất cát pha đạt chuẩn kim loại nặng bằng 0 trước gieo.",
        mediaUrls: [],
        loggedAt: "2026-09-12T03:00:00.000Z",
        engineerName: "Kỹ sư Nguyễn Minh Thảo",
      },
      {
        id: "log-d2-2",
        actionType: FarmingActionType.HARVESTING,
        description:
          "Nhổ củ lúc 5h sáng, rửa nước giếng lọc vi sinh và phân loại kích cỡ.",
        mediaUrls: [],
        loggedAt: "2026-11-21T22:00:00.000Z",
        engineerName: "Kỹ sư Nguyễn Minh Thảo",
      },
    ],
  },
};

/**
 * Looks up a showcase batch traceability record by batch code (case-insensitive).
 *
 * @param batchCode Candidate batch code from the `/trace/:batchCode` route param.
 * @returns Matching `BatchTraceRecord` or `undefined` when not found.
 */
export function getShowcaseTraceByCode(
  batchCode: string,
): BatchTraceRecord | undefined {
  const normalized = batchCode.trim().toUpperCase();
  return SHOWCASE_TRACE_RECORDS[normalized];
}

/**
 * Returns all showcase batch traceability records for the `/trace` directory page.
 *
 * @returns Ordered list of showcase batch traceability records.
 */
export function getShowcaseTraceList(): readonly BatchTraceRecord[] {
  return Object.values(SHOWCASE_TRACE_RECORDS);
}
