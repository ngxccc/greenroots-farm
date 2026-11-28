import { describe, expect, it } from "bun:test";
import {
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  UserRole,
} from "@greenroots/shared";
import {
  canConfirmCodPayment,
  canConfirmCodRole,
  canViewSuperAdminCashflow,
  formatCashflowBucketLabel,
  formatCompactVnd,
  formatSignedLedgerAmount,
  formatVnd,
  getReconciliationBadge,
} from "./finance.utils";

describe("finance.utils", () => {
  describe("canViewSuperAdminCashflow", () => {
    it("allows only super_admin to view and query cashflow analytics", () => {
      // Invariant: SuperAdmin cashflow isolation
      expect(canViewSuperAdminCashflow(UserRole.SUPER_ADMIN)).toBe(true);
    });

    it("blocks admin, sales, farm_staff, customer, guest, and missing roles from cashflow analytics", () => {
      // Invariant: SuperAdmin cashflow isolation
      expect(canViewSuperAdminCashflow(UserRole.ADMIN)).toBe(false);
      expect(canViewSuperAdminCashflow(UserRole.SALES)).toBe(false);
      expect(canViewSuperAdminCashflow(UserRole.FARM_STAFF)).toBe(false);
      expect(canViewSuperAdminCashflow(UserRole.CUSTOMER)).toBe(false);
      expect(canViewSuperAdminCashflow(UserRole.GUEST)).toBe(false);
      expect(canViewSuperAdminCashflow(null)).toBe(false);
      expect(canViewSuperAdminCashflow(undefined)).toBe(false);
    });
  });

  describe("canConfirmCodRole and canConfirmCodPayment", () => {
    it("authorizes sales, admin, and super_admin roles for COD confirmation", () => {
      expect(canConfirmCodRole(UserRole.SALES)).toBe(true);
      expect(canConfirmCodRole(UserRole.ADMIN)).toBe(true);
      expect(canConfirmCodRole(UserRole.SUPER_ADMIN)).toBe(true);
      expect(canConfirmCodRole(UserRole.FARM_STAFF)).toBe(false);
      expect(canConfirmCodRole(UserRole.CUSTOMER)).toBe(false);
      expect(canConfirmCodRole(null)).toBe(false);
    });

    it("allows manual COD confirmation only when payment is pending COD payment and role is authorized", () => {
      expect(
        canConfirmCodPayment(
          {
            paymentMethod: PaymentMethod.COD,
            status: PaymentStatus.PENDING,
            transactionType: PaymentTransactionType.PAYMENT,
          },
          UserRole.SALES,
        ),
      ).toBe(true);

      expect(
        canConfirmCodPayment(
          {
            paymentMethod: PaymentMethod.COD,
            status: PaymentStatus.PENDING,
            transactionType: PaymentTransactionType.PAYMENT,
          },
          UserRole.ADMIN,
        ),
      ).toBe(true);
    });

    it("rejects manual COD confirmation for paid COD, PayOS, subscription, refund rows, or unauthorized roles", () => {
      expect(
        canConfirmCodPayment(
          {
            paymentMethod: PaymentMethod.COD,
            status: PaymentStatus.PAID,
            transactionType: PaymentTransactionType.PAYMENT,
          },
          UserRole.SALES,
        ),
      ).toBe(false);

      expect(
        canConfirmCodPayment(
          {
            paymentMethod: PaymentMethod.PAYOS,
            status: PaymentStatus.PENDING,
            transactionType: PaymentTransactionType.PAYMENT,
          },
          UserRole.SUPER_ADMIN,
        ),
      ).toBe(false);

      expect(
        canConfirmCodPayment(
          {
            paymentMethod: PaymentMethod.SUBSCRIPTION,
            status: PaymentStatus.PENDING,
            transactionType: PaymentTransactionType.PAYMENT,
          },
          UserRole.ADMIN,
        ),
      ).toBe(false);

      expect(
        canConfirmCodPayment(
          {
            paymentMethod: PaymentMethod.COD,
            status: PaymentStatus.PENDING,
            transactionType: PaymentTransactionType.REFUND,
          },
          UserRole.ADMIN,
        ),
      ).toBe(false);

      expect(
        canConfirmCodPayment(
          {
            paymentMethod: PaymentMethod.COD,
            status: PaymentStatus.PENDING,
            transactionType: PaymentTransactionType.PAYMENT,
          },
          UserRole.FARM_STAFF,
        ),
      ).toBe(false);
    });
  });

  describe("getReconciliationBadge", () => {
    it("marks paid PayOS transactions as matched with PayOS order code detail", () => {
      const badge = getReconciliationBadge({
        paymentMethod: PaymentMethod.PAYOS,
        status: PaymentStatus.PAID,
        transactionType: PaymentTransactionType.PAYMENT,
        payosOrderCode: 123456,
        referenceCode: "FT2633001",
        verifiedByName: null,
      });

      expect(badge.tone).toBe("matched");
      expect(badge.detail).toBe("Mã PayOS #123456");
    });

    it("marks pending and failed PayOS transactions with pending or issue tones", () => {
      const pendingBadge = getReconciliationBadge({
        paymentMethod: PaymentMethod.PAYOS,
        status: PaymentStatus.PENDING,
        transactionType: PaymentTransactionType.PAYMENT,
        payosOrderCode: 987654,
        referenceCode: null,
        verifiedByName: null,
      });
      expect(pendingBadge.tone).toBe("pending");

      const failedBadge = getReconciliationBadge({
        paymentMethod: PaymentMethod.PAYOS,
        status: PaymentStatus.FAILED,
        transactionType: PaymentTransactionType.PAYMENT,
        payosOrderCode: null,
        referenceCode: null,
        verifiedByName: null,
      });
      expect(failedBadge.tone).toBe("issue");
    });

    it("includes verifier attribution on settled COD rows", () => {
      const badge = getReconciliationBadge({
        paymentMethod: PaymentMethod.COD,
        status: PaymentStatus.PAID,
        transactionType: PaymentTransactionType.PAYMENT,
        payosOrderCode: null,
        referenceCode: null,
        verifiedByName: "Nguyễn Văn A",
      });

      expect(badge.tone).toBe("manual");
      expect(badge.detail).toBe("Xác nhận: Nguyễn Văn A");
    });
  });

  describe("formatting helpers", () => {
    it("formats integer VND values and signed refund amounts", () => {
      expect(formatVnd(150000)).toBe("150.000đ");
      expect(
        formatSignedLedgerAmount(150000, PaymentTransactionType.PAYMENT),
      ).toBe("150.000đ");
      expect(
        formatSignedLedgerAmount(150000, PaymentTransactionType.REFUND),
      ).toBe("-150.000đ");
    });

    it("formats compact VND chart axis labels for millions, thousands, and small amounts", () => {
      expect(formatCompactVnd(2_000_000)).toBe("2 tr");
      expect(formatCompactVnd(1_500_000)).toBe("1,5 tr");
      expect(formatCompactVnd(450_000)).toBe("450 k");
      expect(formatCompactVnd(-250_000)).toBe("-250 k");
      expect(formatCompactVnd(500)).toBe("500đ");
    });

    it("formats day, week, and month cashflow buckets for Vietnamese axes", () => {
      expect(formatCashflowBucketLabel("2026-11-28", "day")).toBe("28/11");
      expect(formatCashflowBucketLabel("2026-11-24", "week")).toBe("24/11");
      expect(formatCashflowBucketLabel("2026-11", "month")).toBe("11/2026");
    });
  });
});
