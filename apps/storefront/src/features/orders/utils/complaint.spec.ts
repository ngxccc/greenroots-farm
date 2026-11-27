import { describe, expect, it } from "bun:test";
import {
  ComplaintCategory,
  ComplaintResolution,
  ComplaintStatus,
  OrderStatus,
} from "@greenroots/shared";
import { submitComplaintAction } from "../actions/complaint-actions";
import {
  buildComplaintFsmSteps,
  formatRemainingCountdown,
  isComplaintWindowExpired,
  isOrderComplaintEligibleStatus,
  validateComplaintImageFile,
  validateComplaintVideoMetadata,
} from "../utils/complaint.utils";

const ORDER_ID = "019fa8bc-8f4d-7000-b366-e691f45cfb91";
const ITEM_ID = "019fa8bc-8f4d-7000-b366-e691f45cfb92";
const VALID_IMAGE =
  "https://res.cloudinary.com/greenroots/image/upload/v1/complaints/a.webp";

describe("Complaint Utils & Actions", () => {
  describe("isOrderComplaintEligibleStatus", () => {
    it("allows delivered and completed orders and rejects earlier or cancelled statuses", () => {
      expect(isOrderComplaintEligibleStatus(OrderStatus.DELIVERED)).toBe(true);
      expect(isOrderComplaintEligibleStatus(OrderStatus.COMPLETED)).toBe(true);
      expect(isOrderComplaintEligibleStatus(OrderStatus.SHIPPING)).toBe(false);
      expect(isOrderComplaintEligibleStatus(OrderStatus.CANCELLED)).toBe(false);
    });
  });

  describe("isComplaintWindowExpired", () => {
    it("enforces the exact 24-hour boundary from deliveredAt", () => {
      // Invariant: INV-CMP-2
      const deliveredAt = "2026-11-24T10:00:00.000Z";
      const exact24h = Date.parse("2026-11-25T10:00:00.000Z");
      const oneMsAfter = exact24h + 1;

      expect(isComplaintWindowExpired(deliveredAt, exact24h)).toBe(false);
      expect(isComplaintWindowExpired(deliveredAt, oneMsAfter)).toBe(true);
      expect(isComplaintWindowExpired(null, exact24h)).toBe(true);
    });

    it("formats remaining milliseconds as HH:MM:SS", () => {
      expect(formatRemainingCountdown(3661_000)).toBe("01:01:01");
      expect(formatRemainingCountdown(-500)).toBe("00:00:00");
    });
  });

  describe("media pre-validation", () => {
    it("rejects oversized images and unsupported MIME types", () => {
      expect(
        validateComplaintImageFile({
          size: 6 * 1024 * 1024,
          type: "image/jpeg",
        }),
      ).not.toBeNull();
      expect(
        validateComplaintImageFile({ size: 1024, type: "image/gif" }),
      ).not.toBeNull();
      expect(
        validateComplaintImageFile({ size: 1024 * 1024, type: "image/webp" }),
      ).toBeNull();
    });

    it("rejects videos exceeding 15MB or 15 seconds", () => {
      expect(
        validateComplaintVideoMetadata({
          size: 16 * 1024 * 1024,
          type: "video/mp4",
          durationSeconds: 10,
        }),
      ).not.toBeNull();
      expect(
        validateComplaintVideoMetadata({
          size: 5 * 1024 * 1024,
          type: "video/mp4",
          durationSeconds: 15.1,
        }),
      ).not.toBeNull();
      expect(
        validateComplaintVideoMetadata({
          size: 5 * 1024 * 1024,
          type: "video/mp4",
          durationSeconds: 15,
        }),
      ).toBeNull();
    });
  });

  describe("buildComplaintFsmSteps", () => {
    it("maps approved refund complaint to completed 3-step timeline", () => {
      const steps = buildComplaintFsmSteps({
        id: "019fa8bc-8f4d-7000-b366-e691f45cfb99",
        orderId: ORDER_ID,
        customerId: "019fa8bc-8f4d-7000-b366-e691f45cfb98",
        category: ComplaintCategory.DAMAGED_WILTED,
        affectedOrderItemIds: [ITEM_ID],
        reason: "Rau bị dập nát",
        proofImageUrls: [VALID_IMAGE],
        proofVideoUrl: null,
        status: ComplaintStatus.APPROVED,
        resolution: ComplaintResolution.REFUND,
        triageNote: null,
        resolutionNote: null,
        refundChannel: null,
        refundAmountVnd: 50_000,
        replacementOrderId: null,
        createdAt: "2026-11-25T08:00:00.000Z",
        updatedAt: "2026-11-25T09:00:00.000Z",
      });

      expect(steps).toHaveLength(3);
      expect(steps[2]?.state).toBe("completed");
      expect(steps[2]?.detail).toBe("Hoàn tiền");
    });
  });

  describe("submitComplaintAction", () => {
    it("surfaces server expiry error without trusting client state", async () => {
      // Invariant: INV-CMP-2
      const result = await submitComplaintAction(
        {
          orderId: ORDER_ID,
          category: ComplaintCategory.DAMAGED_WILTED,
          affectedOrderItemIds: [ITEM_ID],
          reason: "Rau bị dập nát khi giao hàng",
          proofImageUrls: [VALID_IMAGE],
        },
        {
          runWithRefresh: async (fn) => fn(),
          postComplaint: () =>
            Promise.resolve({
              response: new Response(null, { status: 422 }),
              error: {
                code: "ORDER_COMPLAINT_WINDOW_EXPIRED",
                status: 422,
                detail: "Window expired",
              },
            }),
        },
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe("ORDER_COMPLAINT_WINDOW_EXPIRED");
      }
    });
  });
});
