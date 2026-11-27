import { describe, expect, it } from "bun:test";
import { UserRole, WasteLogStatus } from "@greenroots/shared";
import {
  calculateRemainingAfterWaste,
  evaluateWasteReviewGuard,
  filterSafeProofMediaUrls,
  isSafeProofMediaUrl,
  REJECTION_REASON_MAX_LENGTH,
  validateRejectionReason,
  WASTE_STATUS_META,
  WASTE_STATUS_TABS,
} from "./waste-utils";

describe("waste-utils", () => {
  describe("evaluateWasteReviewGuard", () => {
    const baseLog = {
      status: WasteLogStatus.PENDING_APPROVAL,
      reporter: {
        id: "user-proposer-1",
        fullName: "Nguyễn Văn A",
      },
    };

    it("allows admin to review a pending proposal from another staff member", () => {
      // Invariant: INV-WASTE-4EYES-1
      const result = evaluateWasteReviewGuard(baseLog, {
        id: "user-admin-2",
        role: UserRole.ADMIN,
      });

      expect(result.canReview).toBe(true);
      expect(result.isSelfProposal).toBe(false);
      expect(result.reason).toBeNull();
    });

    it("allows super_admin to review a pending proposal from another staff member", () => {
      const result = evaluateWasteReviewGuard(baseLog, {
        id: "user-super-admin-3",
        role: UserRole.SUPER_ADMIN,
      });

      expect(result.canReview).toBe(true);
      expect(result.isSelfProposal).toBe(false);
      expect(result.reason).toBeNull();
    });

    it("blocks self-review when current user matches the proposal reporter", () => {
      // Invariant: INV-WASTE-4EYES-2
      const result = evaluateWasteReviewGuard(baseLog, {
        id: "user-proposer-1",
        role: UserRole.ADMIN,
      });

      expect(result.canReview).toBe(false);
      expect(result.isSelfProposal).toBe(true);
      expect(result.reason).toContain("4 mắt");
    });

    it("blocks review when current user lacks admin privileges", () => {
      const result = evaluateWasteReviewGuard(baseLog, {
        id: "user-staff-2",
        role: UserRole.FARM_STAFF,
      });

      expect(result.canReview).toBe(false);
      expect(result.isSelfProposal).toBe(false);
      expect(result.reason).not.toBeNull();
    });

    it("blocks review when current user is missing", () => {
      const result = evaluateWasteReviewGuard(baseLog, null);

      expect(result.canReview).toBe(false);
      expect(result.isSelfProposal).toBe(false);
      expect(result.reason).not.toBeNull();
    });

    it("disables review actions when proposal is already approved or rejected", () => {
      const approvedResult = evaluateWasteReviewGuard(
        { ...baseLog, status: WasteLogStatus.APPROVED },
        { id: "user-admin-2", role: UserRole.ADMIN },
      );
      const rejectedResult = evaluateWasteReviewGuard(
        { ...baseLog, status: WasteLogStatus.REJECTED },
        { id: "user-admin-2", role: UserRole.ADMIN },
      );

      expect(approvedResult.canReview).toBe(false);
      expect(approvedResult.isSelfProposal).toBe(false);
      expect(rejectedResult.canReview).toBe(false);
      expect(rejectedResult.isSelfProposal).toBe(false);
    });
  });

  describe("WASTE_STATUS_META and WASTE_STATUS_TABS", () => {
    it("maps every WasteLogStatus to a Vietnamese label and badge style", () => {
      expect(WASTE_STATUS_META[WasteLogStatus.PENDING_APPROVAL].label).toBe(
        "Chờ duyệt",
      );
      expect(WASTE_STATUS_META[WasteLogStatus.APPROVED].label).toBe("Đã duyệt");
      expect(WASTE_STATUS_META[WasteLogStatus.REJECTED].label).toBe("Từ chối");
    });

    it("exposes tabs for pending, approved, rejected, and all proposals", () => {
      const values = WASTE_STATUS_TABS.map((tab) => tab.value);
      expect(values).toEqual([
        WasteLogStatus.PENDING_APPROVAL,
        WasteLogStatus.APPROVED,
        WasteLogStatus.REJECTED,
        "all",
      ]);
    });
  });

  describe("validateRejectionReason", () => {
    it("rejects empty or whitespace-only rejection reasons", () => {
      expect(validateRejectionReason("").valid).toBe(false);
      expect(validateRejectionReason("   \n\t  ").valid).toBe(false);
    });

    it("rejects rejection reasons exceeding the maximum character limit", () => {
      const oversized = "a".repeat(REJECTION_REASON_MAX_LENGTH + 1);
      const result = validateRejectionReason(oversized);
      expect(result.valid).toBe(false);
    });

    it("trims and accepts valid rejection reasons within bounds", () => {
      const result = validateRejectionReason("  Ảnh cân đo chưa rõ số kg.  ");
      expect(result).toEqual({
        valid: true,
        value: "Ảnh cân đo chưa rõ số kg.",
      });
    });
  });

  describe("isSafeProofMediaUrl and filterSafeProofMediaUrls", () => {
    it("accepts valid HTTPS URLs and rejects unsafe or malformed URLs", () => {
      expect(
        isSafeProofMediaUrl(
          "https://res.cloudinary.com/greenroots/image/upload/v1/proof.jpg",
        ),
      ).toBe(true);
      expect(isSafeProofMediaUrl("http://example.com/proof.jpg")).toBe(false);
      expect(isSafeProofMediaUrl("javascript:alert(1)")).toBe(false);
      expect(isSafeProofMediaUrl("data:image/png;base64,AAAA")).toBe(false);
      expect(isSafeProofMediaUrl("")).toBe(false);
      expect(isSafeProofMediaUrl("not-a-url")).toBe(false);
    });

    it("filters media arrays to safe trimmed HTTPS URLs in order", () => {
      const filtered = filterSafeProofMediaUrls([
        "  https://res.cloudinary.com/demo/image/upload/a.webp  ",
        "javascript:alert(1)",
        "https://res.cloudinary.com/demo/image/upload/b.webp",
      ]);

      expect(filtered).toEqual([
        "https://res.cloudinary.com/demo/image/upload/a.webp",
        "https://res.cloudinary.com/demo/image/upload/b.webp",
      ]);
    });
  });

  describe("calculateRemainingAfterWaste", () => {
    it("computes remaining batch stock and flags proposals exceeding available stock", () => {
      expect(calculateRemainingAfterWaste(20, 5)).toEqual({
        remainingQuantity: 15,
        exceedsAvailable: false,
      });

      expect(calculateRemainingAfterWaste(3, 5)).toEqual({
        remainingQuantity: 0,
        exceedsAvailable: true,
      });
    });
  });
});
