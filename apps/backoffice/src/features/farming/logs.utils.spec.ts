import { FarmingActionType, SeasonStatus } from "@greenroots/shared";
import { describe, expect, it } from "bun:test";
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "@/lib/cloudinary-upload";
import {
  FARMING_ACTION_LIST,
  FARMING_ACTION_MAP,
  MAX_FARMING_LOG_DESCRIPTION_LENGTH,
  MAX_FARMING_LOG_MEDIA,
  buildCorrectionLogPayload,
  buildCreateFarmingLogPayload,
  isActionAllowedForSeasonStatus,
  pickDefaultSeasonId,
  validateFarmingLogDescription,
  validateMediaSelection,
} from "./logs.utils";

describe("logs.utils", () => {
  describe("FARMING_ACTION_LIST", () => {
    it("maps all 8 FarmingActionType values with correction as the 8th action", () => {
      // Invariant: INV-BO-02-ACTION-GRID
      expect(FARMING_ACTION_LIST).toHaveLength(8);
      const values = FARMING_ACTION_LIST.map((item) => item.value);
      expect(values).toEqual([
        FarmingActionType.SEEDING,
        FarmingActionType.WATERING,
        FarmingActionType.BIO_FERTILIZING,
        FarmingActionType.WEEDING,
        FarmingActionType.PEST_CONTROL,
        FarmingActionType.SOIL_TESTING,
        FarmingActionType.HARVESTING,
        FarmingActionType.CORRECTION,
      ]);
      expect(FARMING_ACTION_LIST[7]?.value).toBe("correction");
      expect(FARMING_ACTION_MAP.correction.label).toBe("Đính chính");
    });
  });

  describe("isActionAllowedForSeasonStatus", () => {
    it("allows only soil_testing and correction when season status is planning", () => {
      expect(
        isActionAllowedForSeasonStatus(
          SeasonStatus.PLANNING,
          FarmingActionType.SOIL_TESTING,
        ),
      ).toBe(true);
      expect(
        isActionAllowedForSeasonStatus(
          SeasonStatus.PLANNING,
          FarmingActionType.CORRECTION,
        ),
      ).toBe(true);
      expect(
        isActionAllowedForSeasonStatus(
          SeasonStatus.PLANNING,
          FarmingActionType.WATERING,
        ),
      ).toBe(false);
    });

    it("allows all 8 actions when season status is active or harvested", () => {
      for (const item of FARMING_ACTION_LIST) {
        expect(
          isActionAllowedForSeasonStatus(SeasonStatus.ACTIVE, item.value),
        ).toBe(true);
        expect(
          isActionAllowedForSeasonStatus(SeasonStatus.HARVESTED, item.value),
        ).toBe(true);
      }
    });

    it("allows only correction when season status is completed", () => {
      expect(
        isActionAllowedForSeasonStatus(
          SeasonStatus.COMPLETED,
          FarmingActionType.CORRECTION,
        ),
      ).toBe(true);
      expect(
        isActionAllowedForSeasonStatus(
          SeasonStatus.COMPLETED,
          FarmingActionType.HARVESTING,
        ),
      ).toBe(false);
    });
  });

  describe("pickDefaultSeasonId", () => {
    it("selects the first active season before harvested or planning seasons", () => {
      const result = pickDefaultSeasonId([
        { id: "s-plan", status: SeasonStatus.PLANNING },
        { id: "s-harv", status: SeasonStatus.HARVESTED },
        { id: "s-act", status: SeasonStatus.ACTIVE },
      ]);
      expect(result).toBe("s-act");
    });

    it("returns an empty string when no seasons are available", () => {
      expect(pickDefaultSeasonId([])).toBe("");
    });
  });

  describe("buildCreateFarmingLogPayload", () => {
    it("trims description and omits mediaUrls when empty", () => {
      const payload = buildCreateFarmingLogPayload({
        actionType: FarmingActionType.WATERING,
        description: "  Tưới nhỏ giọt lúc 5h sáng  ",
        mediaUrls: [],
      });
      expect(payload).toEqual({
        actionType: "watering",
        description: "Tưới nhỏ giọt lúc 5h sáng",
      });
      expect("mediaUrls" in payload).toBe(false);
    });

    it("includes non-empty mediaUrls when provided", () => {
      const payload = buildCreateFarmingLogPayload({
        actionType: FarmingActionType.SEEDING,
        description: "Gieo hạt lô A1",
        mediaUrls: [
          "https://res.cloudinary.com/greenroots/image/upload/v1/farming_logs/a.jpg",
        ],
      });
      expect(payload).toEqual({
        actionType: "seeding",
        description: "Gieo hạt lô A1",
        mediaUrls: [
          "https://res.cloudinary.com/greenroots/image/upload/v1/farming_logs/a.jpg",
        ],
      });
    });
  });

  describe("buildCorrectionLogPayload", () => {
    it("sets actionType to correction and attaches correctsLogId", () => {
      // Invariant: INV-FARMING-LOG-CORRECTION
      const targetId = "019315bc-3e9a-7a1b-8f3e-2b1d0a5c4e9f";
      const payload = buildCorrectionLogPayload({
        correctsLogId: targetId,
        description: "  Đính chính liều lượng phân bón thành 2kg/100m2  ",
        mediaUrls: [
          "https://res.cloudinary.com/greenroots/image/upload/v1/farming_logs/fix.jpg",
        ],
      });

      expect(payload).toEqual({
        actionType: "correction",
        correctsLogId: targetId,
        description: "Đính chính liều lượng phân bón thành 2kg/100m2",
        mediaUrls: [
          "https://res.cloudinary.com/greenroots/image/upload/v1/farming_logs/fix.jpg",
        ],
      });
    });
  });

  describe("validateFarmingLogDescription", () => {
    it("rejects empty or whitespace-only descriptions", () => {
      expect(validateFarmingLogDescription("")).not.toBeNull();
      expect(validateFarmingLogDescription("   \n  ")).not.toBeNull();
    });

    it("rejects descriptions exceeding 2000 characters", () => {
      const oversized = "a".repeat(MAX_FARMING_LOG_DESCRIPTION_LENGTH + 1);
      expect(validateFarmingLogDescription(oversized)).not.toBeNull();
      expect(
        validateFarmingLogDescription(
          "a".repeat(MAX_FARMING_LOG_DESCRIPTION_LENGTH),
        ),
      ).toBeNull();
    });
  });

  describe("validateMediaSelection", () => {
    it("rejects selections exceeding the 3-attachment limit", () => {
      expect(
        validateMediaSelection(
          [{ size: 1024, type: "image/jpeg" }],
          MAX_FARMING_LOG_MEDIA,
        ),
      ).not.toBeNull();
    });

    it("rejects oversized images, oversized videos, and unsupported MIME types", () => {
      expect(
        validateMediaSelection(
          [{ size: MAX_IMAGE_BYTES + 1, type: "image/png" }],
          0,
        ),
      ).not.toBeNull();
      expect(
        validateMediaSelection(
          [{ size: MAX_VIDEO_BYTES + 1, type: "video/mp4" }],
          0,
        ),
      ).not.toBeNull();
      expect(
        validateMediaSelection([{ size: 1024, type: "application/pdf" }], 0),
      ).not.toBeNull();
    });

    it("accepts valid image and video files within limits", () => {
      expect(
        validateMediaSelection(
          [
            { size: MAX_IMAGE_BYTES, type: "image/webp" },
            { size: MAX_VIDEO_BYTES, type: "video/mp4" },
          ],
          1,
        ),
      ).toBeNull();
    });
  });
});
