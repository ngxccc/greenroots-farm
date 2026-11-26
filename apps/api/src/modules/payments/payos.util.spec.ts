import { describe, expect, it, mock } from "bun:test";
import { cancelPaymentLinksBestEffort } from "./payos.util";

describe("payos.util", () => {
  describe("cancelPaymentLinksBestEffort", () => {
    it("skips driver calls when target list is empty", async () => {
      const cancelPaymentLink = mock(() => Promise.resolve({} as never));
      const warn = mock(() => undefined);

      await cancelPaymentLinksBestEffort(
        { cancelPaymentLink },
        { warn },
        [],
        "Order reservation expired",
      );

      expect(cancelPaymentLink).not.toHaveBeenCalled();
      expect(warn).not.toHaveBeenCalled();
    });

    it("cancels all targets and logs warnings without throwing when some links fail", async () => {
      const cancelPaymentLink = mock((orderCode: number) => {
        if (orderCode === 1002) {
          return Promise.reject(new Error("PayOS timeout"));
        }
        return Promise.resolve({
          paymentLinkId: `link-${orderCode}`,
          orderCode,
          status: "CANCELLED" as const,
          canceledAt: null,
          cancellationReason: "Order reservation expired",
        });
      });
      const warn = mock(() => undefined);

      const targets = [
        { orderCode: 1001, referenceId: "id-1" },
        { orderCode: 1002, referenceId: "id-2" },
        { orderCode: 1003, referenceId: "id-3" },
        { orderCode: 1004, referenceId: "id-4" },
        { orderCode: 1005, referenceId: "id-5" },
        { orderCode: 1006, referenceId: "id-6" },
      ];

      await cancelPaymentLinksBestEffort(
        { cancelPaymentLink },
        { warn },
        targets,
        "Order reservation expired",
      );

      expect(cancelPaymentLink).toHaveBeenCalledTimes(6);
      expect(warn).toHaveBeenCalledTimes(1);
    });
  });
});
