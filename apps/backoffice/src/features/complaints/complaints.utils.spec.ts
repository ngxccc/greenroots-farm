import {
  ComplaintRefundChannel,
  ComplaintResolution,
  ComplaintStatus,
  UserRole,
} from "@greenroots/shared";
import { describe, expect, it } from "bun:test";
import {
  buildResolvePayload,
  buildTriagePayload,
  canResolveComplaints,
  canViewAndTriageComplaints,
  COMPLAINT_NOTE_MAX_LENGTH,
  evaluateResolveGuard,
  evaluateTriageGuard,
  filterSafeMediaUrls,
  isSafeMediaUrl,
} from "./complaints.utils";

describe("complaints.utils", () => {
  describe("canViewAndTriageComplaints", () => {
    it("allows sales, admin, and super_admin roles to view and triage", () => {
      // Invariant: 2-tier RBAC grants triage access to sales, admin, and super_admin.
      expect(canViewAndTriageComplaints(UserRole.SALES)).toBe(true);
      expect(canViewAndTriageComplaints(UserRole.ADMIN)).toBe(true);
      expect(canViewAndTriageComplaints(UserRole.SUPER_ADMIN)).toBe(true);
    });

    it("denies farm_staff, customer, guest, and missing roles", () => {
      expect(canViewAndTriageComplaints(UserRole.FARM_STAFF)).toBe(false);
      expect(canViewAndTriageComplaints(UserRole.CUSTOMER)).toBe(false);
      expect(canViewAndTriageComplaints(UserRole.GUEST)).toBe(false);
      expect(canViewAndTriageComplaints(null)).toBe(false);
      expect(canViewAndTriageComplaints(undefined)).toBe(false);
    });
  });

  describe("canResolveComplaints", () => {
    it("allows admin and super_admin roles to resolve complaints", () => {
      // Invariant: 2-tier RBAC restricts refund and 0đ replacement resolution to admin/super_admin.
      expect(canResolveComplaints(UserRole.ADMIN)).toBe(true);
      expect(canResolveComplaints(UserRole.SUPER_ADMIN)).toBe(true);
    });

    it("denies sales, farm_staff, customer, and missing roles", () => {
      expect(canResolveComplaints(UserRole.SALES)).toBe(false);
      expect(canResolveComplaints(UserRole.FARM_STAFF)).toBe(false);
      expect(canResolveComplaints(UserRole.CUSTOMER)).toBe(false);
      expect(canResolveComplaints(null)).toBe(false);
    });
  });

  describe("evaluateTriageGuard", () => {
    it("allows sales to triage or reject a pending complaint", () => {
      const result = evaluateTriageGuard(
        ComplaintStatus.PENDING,
        UserRole.SALES,
      );
      expect(result.canTriage).toBe(true);
      expect(result.canReject).toBe(true);
      expect(result.isOverrideMode).toBe(false);
    });

    it("denies sales override on an already triaged complaint", () => {
      const result = evaluateTriageGuard(
        ComplaintStatus.TRIAGED,
        UserRole.SALES,
      );
      expect(result.canTriage).toBe(false);
      expect(result.canReject).toBe(false);
      expect(result.isOverrideMode).toBe(false);
    });

    it("allows admin to override a triaged complaint to rejected", () => {
      const result = evaluateTriageGuard(
        ComplaintStatus.TRIAGED,
        UserRole.ADMIN,
      );
      expect(result.canTriage).toBe(false);
      expect(result.canReject).toBe(true);
      expect(result.isOverrideMode).toBe(true);
    });

    it("blocks triage actions on terminal approved or rejected complaints", () => {
      expect(
        evaluateTriageGuard(ComplaintStatus.APPROVED, UserRole.SUPER_ADMIN)
          .canReject,
      ).toBe(false);
      expect(
        evaluateTriageGuard(ComplaintStatus.REJECTED, UserRole.SUPER_ADMIN)
          .canReject,
      ).toBe(false);
    });
  });

  describe("evaluateResolveGuard", () => {
    it("allows admin and super_admin to resolve a triaged complaint", () => {
      expect(
        evaluateResolveGuard(ComplaintStatus.TRIAGED, UserRole.ADMIN)
          .canResolve,
      ).toBe(true);
      expect(
        evaluateResolveGuard(ComplaintStatus.TRIAGED, UserRole.SUPER_ADMIN)
          .canResolve,
      ).toBe(true);
    });

    it("blocks sales from resolving a triaged complaint with a role notice", () => {
      const result = evaluateResolveGuard(
        ComplaintStatus.TRIAGED,
        UserRole.SALES,
      );
      expect(result.canResolve).toBe(false);
      expect(result.reason).toContain("Admin");
    });

    it("blocks resolving a pending complaint before triage", () => {
      const result = evaluateResolveGuard(
        ComplaintStatus.PENDING,
        UserRole.ADMIN,
      );
      expect(result.canResolve).toBe(false);
      expect(result.reason).toBeTruthy();
    });
  });

  describe("buildTriagePayload", () => {
    it("builds a triaged payload without requiring a note", () => {
      const result = buildTriagePayload("triaged", "   ");
      expect(result).toEqual({
        ok: true,
        payload: { status: "triaged" },
      });
    });

    it("rejects a rejection payload when rationale is shorter than 5 characters", () => {
      const result = buildTriagePayload("rejected", "  abc ");
      expect(result.ok).toBe(false);
    });

    it("rejects a triage payload when note exceeds 500 characters", () => {
      const result = buildTriagePayload(
        "triaged",
        "a".repeat(COMPLAINT_NOTE_MAX_LENGTH + 1),
      );
      expect(result.ok).toBe(false);
    });

    it("builds a trimmed rejection payload when rationale is valid", () => {
      const result = buildTriagePayload("rejected", "  Ảnh không rõ tem QR  ");
      expect(result).toEqual({
        ok: true,
        payload: {
          status: "rejected",
          triageNote: "Ảnh không rõ tem QR",
        },
      });
    });
  });

  describe("buildResolvePayload", () => {
    it("builds a bank transfer refund payload with reference code", () => {
      const result = buildResolvePayload({
        resolution: ComplaintResolution.REFUND,
        refundChannel: ComplaintRefundChannel.BANK_TRANSFER,
        refundAmountVnd: 150000,
        orderTotalVnd: 200000,
        referenceCode: "  VCB-20261128  ",
        resolutionNote: "  Hoàn 75% do rau dập  ",
      });
      expect(result).toEqual({
        ok: true,
        payload: {
          resolution: ComplaintResolution.REFUND,
          refundChannel: ComplaintRefundChannel.BANK_TRANSFER,
          refundAmountVnd: 150000,
          referenceCode: "VCB-20261128",
          resolutionNote: "Hoàn 75% do rau dập",
        },
      });
    });

    it("omits bank reference code when refund channel is loyalty_points", () => {
      const result = buildResolvePayload({
        resolution: ComplaintResolution.REFUND,
        refundChannel: ComplaintRefundChannel.LOYALTY_POINTS,
        refundAmountVnd: 100000,
        orderTotalVnd: 100000,
        referenceCode: "SHOULD_BE_IGNORED",
      });
      expect(result).toEqual({
        ok: true,
        payload: {
          resolution: ComplaintResolution.REFUND,
          refundChannel: ComplaintRefundChannel.LOYALTY_POINTS,
          refundAmountVnd: 100000,
        },
      });
    });

    it("rejects refund amounts exceeding the original order total", () => {
      const result = buildResolvePayload({
        resolution: ComplaintResolution.REFUND,
        refundChannel: ComplaintRefundChannel.BANK_TRANSFER,
        refundAmountVnd: 250000,
        orderTotalVnd: 200000,
      });
      expect(result.ok).toBe(false);
    });

    it("rejects non-integer or non-positive refund amounts", () => {
      expect(
        buildResolvePayload({
          resolution: ComplaintResolution.REFUND,
          refundChannel: ComplaintRefundChannel.LOYALTY_POINTS,
          refundAmountVnd: 0,
          orderTotalVnd: 200000,
        }).ok,
      ).toBe(false);

      expect(
        buildResolvePayload({
          resolution: ComplaintResolution.REFUND,
          refundChannel: ComplaintRefundChannel.LOYALTY_POINTS,
          refundAmountVnd: 1000.5,
          orderTotalVnd: 200000,
        }).ok,
      ).toBe(false);
    });

    it("builds a full-copy replacement payload without items", () => {
      const result = buildResolvePayload({
        resolution: ComplaintResolution.REPLACEMENT,
        mode: "full",
        resolutionNote: "  Giao bù chuyến Thứ 6  ",
      });
      expect(result).toEqual({
        ok: true,
        payload: {
          resolution: ComplaintResolution.REPLACEMENT,
          resolutionNote: "Giao bù chuyến Thứ 6",
        },
      });
    });

    it("rejects partial replacement when no items are selected", () => {
      const result = buildResolvePayload({
        resolution: ComplaintResolution.REPLACEMENT,
        mode: "partial",
        items: [],
      });
      expect(result.ok).toBe(false);
    });

    it("rejects partial replacement when quantity exceeds original item quantity", () => {
      const result = buildResolvePayload({
        resolution: ComplaintResolution.REPLACEMENT,
        mode: "partial",
        items: [{ productId: "prod-1", quantity: 3, maxQuantity: 2 }],
      });
      expect(result.ok).toBe(false);
    });
  });

  describe("isSafeMediaUrl", () => {
    it("accepts https and http media URLs", () => {
      expect(
        isSafeMediaUrl(
          "https://res.cloudinary.com/greenroots/image/upload/v1/proof.jpg",
        ),
      ).toBe(true);
      expect(isSafeMediaUrl("http://localhost:9000/complaints/video.mp4")).toBe(
        true,
      );
    });

    it("blocks javascript, data, file, and malformed URLs", () => {
      // Invariant: Unsafe URL schemes must never be rendered in <img>, <video>, or <a>.
      expect(isSafeMediaUrl("javascript:alert(1)")).toBe(false);
      expect(isSafeMediaUrl("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
      expect(isSafeMediaUrl("file:///etc/passwd")).toBe(false);
      expect(isSafeMediaUrl("not-a-valid-url")).toBe(false);
      expect(isSafeMediaUrl("")).toBe(false);
      expect(isSafeMediaUrl(null)).toBe(false);
    });

    it("filters unsafe entries from a proof URL array", () => {
      const filtered = filterSafeMediaUrls([
        "https://res.cloudinary.com/demo/image/upload/sample.jpg",
        "javascript:alert(1)",
        "http://cdn.example.com/proof.png",
        "data:text/html,<script>alert(1)</script>",
      ]);
      expect(filtered).toEqual([
        "https://res.cloudinary.com/demo/image/upload/sample.jpg",
        "http://cdn.example.com/proof.png",
      ]);
    });
  });
});
