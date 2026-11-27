import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { describe, expect, it, mock } from "bun:test";
import {
  API_ERROR_CODES,
  ComplaintCategory,
  ComplaintRefundChannel,
  ComplaintResolution,
  ComplaintStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  UserRole,
} from "@greenroots/shared";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import { env } from "@/common/config/env.config";
import type { DrizzleDB } from "@/database/database.module";
import type { CloudinaryService } from "@/modules/media/cloudinary.service";
import { ComplaintsService } from "./complaints.service";
import {
  createComplaintSchema,
  listComplaintsQuerySchema,
  resolveComplaintSchema,
  triageComplaintSchema,
} from "./dto";

const ORDER_ID = "019fa8bc-8f4d-7000-b366-e691f45cfb91";
const CUSTOMER_ID = "019fa8bc-8f4d-7000-b366-e691f45cfb92";
const OTHER_CUSTOMER_ID = "019fa8bc-8f4d-7000-b366-e691f45cfb93";
const COMPLAINT_ID = "019fa8bc-8f4d-7000-b366-e691f45cfb94";
const ORDER_ITEM_ID = "019fa8bc-8f4d-7000-b366-e691f45cfb95";
const FOREIGN_ITEM_ID = "019fa8bc-8f4d-7000-b366-e691f45cfb96";

const VALID_IMAGE_URL = `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/v1/complaints/damage-1.webp`;
const VALID_VIDEO_URL = `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/video/upload/v1/complaints/clip.mp4`;

function createSelectChain<T>(rows: T[]) {
  return {
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(rows),
      }),
    }),
  };
}

function createWhereChain<T>(rows: T[]) {
  return {
    from: () => ({
      where: () => Promise.resolve(rows),
    }),
  };
}

function createServiceHarness(options: {
  orderRows: {
    id: string;
    customerId: string;
    orderStatus: OrderStatus;
    deliveredAt: Date | null;
  }[];
  existingComplaintRows?: Record<string, unknown>[];
  matchingOrderItemRows?: { id: string }[];
  insertError?: Error;
  verifyError?: Error;
}) {
  let selectCall = 0;
  const insertReturning = mock(() => {
    if (options.insertError) {
      return Promise.reject(options.insertError);
    }
    const now = new Date("2026-11-25T10:00:00.000Z");
    return Promise.resolve([
      {
        id: COMPLAINT_ID,
        orderId: ORDER_ID,
        customerId: CUSTOMER_ID,
        category: ComplaintCategory.DAMAGED_WILTED,
        affectedOrderItemIds: [ORDER_ITEM_ID],
        reason: "Rau bị dập nát khi giao hàng",
        proofImageUrls: [VALID_IMAGE_URL],
        proofVideoUrl: VALID_VIDEO_URL,
        status: ComplaintStatus.PENDING,
        resolution: null as ComplaintResolution | null,
        triageNote: null,
        resolutionNote: null,
        refundChannel: null,
        refundAmountVnd: null,
        replacementOrderId: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  });

  const dbMock = {
    select: mock(() => {
      selectCall += 1;
      if (selectCall === 1) {
        return createSelectChain(options.orderRows);
      }
      if (selectCall === 2) {
        return createSelectChain(options.existingComplaintRows ?? []);
      }
      return createWhereChain(
        options.matchingOrderItemRows ?? [{ id: ORDER_ITEM_ID }],
      );
    }),
    insert: mock(() => ({
      values: () => ({
        returning: insertReturning,
      }),
    })),
  } as unknown as DrizzleDB;

  const verifyComplaintMedia = mock(() => {
    if (options.verifyError) {
      return Promise.reject(options.verifyError);
    }
    return Promise.resolve();
  });

  const cloudinaryMock = {
    verifyComplaintMedia,
  } as unknown as CloudinaryService;

  const service = new ComplaintsService(dbMock, cloudinaryMock);
  return { service, verifyComplaintMedia, insertReturning };
}

describe("ComplaintsService", () => {
  describe("createComplaintSchema", () => {
    it("strips HTML tags and trims complaint reason", () => {
      const parsed = createComplaintSchema.parse({
        category: ComplaintCategory.DAMAGED_WILTED,
        affectedOrderItemIds: [ORDER_ITEM_ID],
        reason: "  <b>Rau</b>   bị dập nát khi giao hàng  ",
        proofImageUrls: [VALID_IMAGE_URL],
      });

      expect(parsed.reason).toBe("Rau bị dập nát khi giao hàng");
    });

    it("rejects duplicate proof image URLs and non-complaints folders", () => {
      const duplicateResult = createComplaintSchema.safeParse({
        category: ComplaintCategory.DAMAGED_WILTED,
        affectedOrderItemIds: [ORDER_ITEM_ID],
        reason: "Rau bị dập nát khi giao hàng",
        proofImageUrls: [VALID_IMAGE_URL, VALID_IMAGE_URL],
      });
      expect(duplicateResult.success).toBe(false);

      const wrongFolderResult = createComplaintSchema.safeParse({
        category: ComplaintCategory.DAMAGED_WILTED,
        affectedOrderItemIds: [ORDER_ITEM_ID],
        reason: "Rau bị dập nát khi giao hàng",
        proofImageUrls: [
          `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/v1/products/item.webp`,
        ],
      });
      expect(wrongFolderResult.success).toBe(false);
    });
  });

  describe("getOrderComplaint", () => {
    it("returns null when owned order has no complaint yet", async () => {
      // Invariant: INV-CMP-1
      const { service } = createServiceHarness({
        orderRows: [
          {
            id: ORDER_ID,
            customerId: CUSTOMER_ID,
            orderStatus: OrderStatus.DELIVERED,
            deliveredAt: new Date("2026-11-25T08:00:00.000Z"),
          },
        ],
        existingComplaintRows: [],
      });

      const result = await service.getOrderComplaint(CUSTOMER_ID, ORDER_ID);
      expect(result).toBeNull();
    });

    it("throws not-found when order belongs to another customer", async () => {
      // Invariant: INV-CMP-1
      const { service } = createServiceHarness({
        orderRows: [
          {
            id: ORDER_ID,
            customerId: OTHER_CUSTOMER_ID,
            orderStatus: OrderStatus.DELIVERED,
            deliveredAt: new Date("2026-11-25T08:00:00.000Z"),
          },
        ],
      });

      let caught: unknown;
      try {
        await service.getOrderComplaint(CUSTOMER_ID, ORDER_ID);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(NotFoundException);
    });

    it("returns customer-safe complaint projection when complaint exists", async () => {
      // Invariant: INV-CMP-6
      const now = new Date("2026-11-25T10:00:00.000Z");
      const { service } = createServiceHarness({
        orderRows: [
          {
            id: ORDER_ID,
            customerId: CUSTOMER_ID,
            orderStatus: OrderStatus.DELIVERED,
            deliveredAt: new Date("2026-11-25T08:00:00.000Z"),
          },
        ],
        existingComplaintRows: [
          {
            id: COMPLAINT_ID,
            orderId: ORDER_ID,
            customerId: CUSTOMER_ID,
            category: ComplaintCategory.DAMAGED_WILTED,
            affectedOrderItemIds: [ORDER_ITEM_ID],
            reason: "Rau bị dập nát khi giao hàng",
            proofImageUrls: [VALID_IMAGE_URL],
            proofVideoUrl: null,
            status: ComplaintStatus.APPROVED,
            resolution: ComplaintResolution.REFUND,
            triageNote: "Đã xác nhận hình ảnh",
            resolutionNote: "Hoàn tiền 100%",
            refundChannel: ComplaintRefundChannel.LOYALTY_POINTS,
            refundAmountVnd: 50_000,
            replacementOrderId: null,
            createdAt: now,
            updatedAt: now,
          },
        ],
      });

      const result = await service.getOrderComplaint(CUSTOMER_ID, ORDER_ID);
      expect(result).toMatchObject({
        id: COMPLAINT_ID,
        category: ComplaintCategory.DAMAGED_WILTED,
        affectedOrderItemIds: [ORDER_ITEM_ID],
        status: ComplaintStatus.APPROVED,
        resolution: ComplaintResolution.REFUND,
        refundChannel: ComplaintRefundChannel.LOYALTY_POINTS,
        refundAmountVnd: 50_000,
      });
    });
  });

  describe("submitComplaint", () => {
    it("creates a pending complaint within 24 hours of deliveredAt", async () => {
      // Invariant: INV-CMP-2
      const deliveredAt = new Date("2026-11-24T10:00:00.000Z");
      const now = new Date("2026-11-25T10:00:00.000Z"); // exact 24h boundary
      const { service, verifyComplaintMedia } = createServiceHarness({
        orderRows: [
          {
            id: ORDER_ID,
            customerId: CUSTOMER_ID,
            orderStatus: OrderStatus.DELIVERED,
            deliveredAt,
          },
        ],
      });

      const result = await service.submitComplaint(
        CUSTOMER_ID,
        ORDER_ID,
        {
          category: ComplaintCategory.DAMAGED_WILTED,
          affectedOrderItemIds: [ORDER_ITEM_ID],
          reason: "Rau bị dập nát khi giao hàng",
          proofImageUrls: [VALID_IMAGE_URL],
          proofVideoUrl: VALID_VIDEO_URL,
        },
        now,
      );

      expect(verifyComplaintMedia).toHaveBeenCalledTimes(1);
      expect(result.status).toBe(ComplaintStatus.PENDING);
      expect(result.resolution).toBeNull();
    });

    it("rejects non-owned order with anti-enumeration not-found error", async () => {
      // Invariant: INV-CMP-1
      const { service } = createServiceHarness({
        orderRows: [
          {
            id: ORDER_ID,
            customerId: OTHER_CUSTOMER_ID,
            orderStatus: OrderStatus.DELIVERED,
            deliveredAt: new Date("2026-11-25T08:00:00.000Z"),
          },
        ],
      });

      let caught: unknown;
      try {
        await service.submitComplaint(CUSTOMER_ID, ORDER_ID, {
          category: ComplaintCategory.DAMAGED_WILTED,
          affectedOrderItemIds: [ORDER_ITEM_ID],
          reason: "Rau bị dập nát khi giao hàng",
          proofImageUrls: [VALID_IMAGE_URL],
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(NotFoundException);
    });

    it("rejects order in shipping status before delivery", async () => {
      const { service } = createServiceHarness({
        orderRows: [
          {
            id: ORDER_ID,
            customerId: CUSTOMER_ID,
            orderStatus: OrderStatus.SHIPPING,
            deliveredAt: null,
          },
        ],
      });

      let caught: unknown;
      try {
        await service.submitComplaint(CUSTOMER_ID, ORDER_ID, {
          category: ComplaintCategory.DAMAGED_WILTED,
          affectedOrderItemIds: [ORDER_ITEM_ID],
          reason: "Rau bị dập nát khi giao hàng",
          proofImageUrls: [VALID_IMAGE_URL],
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({
        response: { code: API_ERROR_CODES.ORDER_COMPLAINT_NOT_ELIGIBLE },
      });
    });

    it("rejects complaint submitted 1ms after the 24-hour window", async () => {
      // Invariant: INV-CMP-2
      const deliveredAt = new Date("2026-11-24T10:00:00.000Z");
      const now = new Date("2026-11-25T10:00:00.001Z");
      const { service } = createServiceHarness({
        orderRows: [
          {
            id: ORDER_ID,
            customerId: CUSTOMER_ID,
            orderStatus: OrderStatus.COMPLETED,
            deliveredAt,
          },
        ],
      });

      let caught: unknown;
      try {
        await service.submitComplaint(
          CUSTOMER_ID,
          ORDER_ID,
          {
            category: ComplaintCategory.DAMAGED_WILTED,
            affectedOrderItemIds: [ORDER_ITEM_ID],
            reason: "Rau bị dập nát khi giao hàng",
            proofImageUrls: [VALID_IMAGE_URL],
          },
          now,
        );
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({
        response: { code: API_ERROR_CODES.ORDER_COMPLAINT_WINDOW_EXPIRED },
      });
    });

    it("rejects affected order item IDs that do not belong to the target order", async () => {
      // Invariant: INV-CMP-5
      const { service, verifyComplaintMedia } = createServiceHarness({
        orderRows: [
          {
            id: ORDER_ID,
            customerId: CUSTOMER_ID,
            orderStatus: OrderStatus.DELIVERED,
            deliveredAt: new Date("2026-11-25T08:00:00.000Z"),
          },
        ],
        matchingOrderItemRows: [],
      });

      let caught: unknown;
      try {
        await service.submitComplaint(
          CUSTOMER_ID,
          ORDER_ID,
          {
            category: ComplaintCategory.WRONG_ITEM,
            affectedOrderItemIds: [FOREIGN_ITEM_ID],
            reason: "Giao nhầm sản phẩm không thuộc đơn hàng",
            proofImageUrls: [VALID_IMAGE_URL],
          },
          new Date("2026-11-25T09:00:00.000Z"),
        );
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({
        response: { code: API_ERROR_CODES.COMPLAINT_ITEMS_INVALID },
      });
      expect(verifyComplaintMedia).not.toHaveBeenCalled();
    });

    it("maps PostgreSQL 23505 on complaints_order_id_uidx to conflict exception", async () => {
      // Invariant: INV-CMP-3
      const pgError = Object.assign(new Error("duplicate key"), {
        code: PG_ERROR_CODE.UNIQUE_VIOLATION,
      });
      const { service } = createServiceHarness({
        orderRows: [
          {
            id: ORDER_ID,
            customerId: CUSTOMER_ID,
            orderStatus: OrderStatus.DELIVERED,
            deliveredAt: new Date("2026-11-25T08:00:00.000Z"),
          },
        ],
        insertError: pgError,
      });

      let caught: unknown;
      try {
        await service.submitComplaint(
          CUSTOMER_ID,
          ORDER_ID,
          {
            category: ComplaintCategory.DAMAGED_WILTED,
            affectedOrderItemIds: [ORDER_ITEM_ID],
            reason: "Rau bị dập nát khi giao hàng",
            proofImageUrls: [VALID_IMAGE_URL],
          },
          new Date("2026-11-25T09:00:00.000Z"),
        );
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ConflictException);
    });

    it("propagates media verification failure without inserting complaint", async () => {
      // Invariant: INV-CMP-4
      const { service, insertReturning } = createServiceHarness({
        orderRows: [
          {
            id: ORDER_ID,
            customerId: CUSTOMER_ID,
            orderStatus: OrderStatus.DELIVERED,
            deliveredAt: new Date("2026-11-25T08:00:00.000Z"),
          },
        ],
        verifyError: new UnprocessableEntityException({
          code: API_ERROR_CODES.COMPLAINT_MEDIA_INVALID,
          detail: "Video exceeds 15s limit",
        }),
      });

      let caught: unknown;
      try {
        await service.submitComplaint(
          CUSTOMER_ID,
          ORDER_ID,
          {
            category: ComplaintCategory.DAMAGED_WILTED,
            affectedOrderItemIds: [ORDER_ITEM_ID],
            reason: "Rau bị dập nát khi giao hàng",
            proofImageUrls: [VALID_IMAGE_URL],
            proofVideoUrl: VALID_VIDEO_URL,
          },
          new Date("2026-11-25T09:00:00.000Z"),
        );
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(UnprocessableEntityException);
      expect(insertReturning).not.toHaveBeenCalled();
    });
  });

  describe("listComplaintsQuerySchema", () => {
    it("applies default pagination and accepts valid filters", () => {
      const parsed = listComplaintsQuerySchema.parse({
        status: ComplaintStatus.PENDING,
        search: "  <b>ORD-2026</b>  ",
      });

      expect(parsed.page).toBe(1);
      expect(parsed.limit).toBe(20);
      expect(parsed.status).toBe(ComplaintStatus.PENDING);
      expect(parsed.search).toBe("ORD-2026");
    });

    it("rejects inverted from and to date range", () => {
      const result = listComplaintsQuerySchema.safeParse({
        from: "2026-11-27T10:00:00.000Z",
        to: "2026-11-26T10:00:00.000Z",
      });

      expect(result.success).toBe(false);
    });

    it("rejects search shorter than two characters", () => {
      const result = listComplaintsQuerySchema.safeParse({
        search: "a",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("triageComplaintSchema", () => {
    it("requires trimmed HTML-stripped triageNote of at least 5 characters when status is rejected", () => {
      // Invariant: INV-CMP-7
      const missingResult = triageComplaintSchema.safeParse({
        status: ComplaintStatus.REJECTED,
      });
      expect(missingResult.success).toBe(false);

      const tooShortAfterStrip = triageComplaintSchema.safeParse({
        status: ComplaintStatus.REJECTED,
        triageNote: "  <b>abc</b>  ",
      });
      expect(tooShortAfterStrip.success).toBe(false);

      const valid = triageComplaintSchema.parse({
        status: ComplaintStatus.REJECTED,
        triageNote:
          "  <script>alert(1)</script><b>Hình ảnh</b> không rõ ràng  ",
      });
      expect(valid.triageNote).toBe("Hình ảnh không rõ ràng");
    });

    it("allows optional triageNote when status is triaged", () => {
      // Invariant: INV-CMP-7
      const withoutNote = triageComplaintSchema.parse({
        status: ComplaintStatus.TRIAGED,
      });
      expect(withoutNote.triageNote).toBeUndefined();

      const withNote = triageComplaintSchema.parse({
        status: ComplaintStatus.TRIAGED,
        triageNote: "  Đã xác minh sơ bộ  ",
      });
      expect(withNote.triageNote).toBe("Đã xác minh sơ bộ");
    });

    it("rejects non-triage target statuses", () => {
      const pendingResult = triageComplaintSchema.safeParse({
        status: ComplaintStatus.PENDING,
      });
      expect(pendingResult.success).toBe(false);

      const approvedResult = triageComplaintSchema.safeParse({
        status: ComplaintStatus.APPROVED,
      });
      expect(approvedResult.success).toBe(false);
    });
  });

  describe("triageComplaint", () => {
    const STAFF_ID = "019fa8bc-8f4d-7000-b366-e691f45cfb95";

    function createTriageHarness(options: {
      lockedRows: { id: string; status: ComplaintStatus }[];
      hydratedRow?: Record<string, unknown>;
    }) {
      const setMock = mock(() => ({
        where: () => Promise.resolve(),
      }));
      const txMock = {
        select: () => ({
          from: () => ({
            where: () => ({
              for: () => Promise.resolve(options.lockedRows),
            }),
          }),
        }),
        update: () => ({
          set: setMock,
        }),
      };
      const dbMock = {
        transaction: mock(async (fn: (tx: typeof txMock) => Promise<unknown>) =>
          fn(txMock),
        ),
        select: () => ({
          from: () => ({
            innerJoin: () => ({
              innerJoin: () => ({
                where: () => ({
                  limit: () =>
                    Promise.resolve(
                      options.hydratedRow ? [options.hydratedRow] : [],
                    ),
                }),
              }),
            }),
          }),
        }),
      } as unknown as DrizzleDB;

      const service = new ComplaintsService(
        dbMock,
        {} as unknown as CloudinaryService,
      );
      return { service, setMock };
    }

    it("throws not-found when target complaint does not exist", async () => {
      const { service } = createTriageHarness({ lockedRows: [] });

      let caught: unknown;
      try {
        await service.triageComplaint(STAFF_ID, UserRole.SALES, COMPLAINT_ID, {
          status: ComplaintStatus.TRIAGED,
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(NotFoundException);
    });

    it("rejects triage when sales tries to override a triaged complaint", async () => {
      // Invariant: INV-CMP-6
      const { service, setMock } = createTriageHarness({
        lockedRows: [{ id: COMPLAINT_ID, status: ComplaintStatus.TRIAGED }],
      });

      let caught: unknown;
      try {
        await service.triageComplaint(STAFF_ID, UserRole.SALES, COMPLAINT_ID, {
          status: ComplaintStatus.REJECTED,
          triageNote: "Không thể phân loại lại",
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({
        response: { code: API_ERROR_CODES.COMPLAINT_INVALID_STATUS_TRANSITION },
      });
      expect(setMock).not.toHaveBeenCalled();
    });

    it("allows admin to override a triaged complaint to rejected", async () => {
      // Invariant: INV-CMP-6, INV-CMP-7
      const now = new Date("2026-11-27T02:00:00.000Z");
      const { service, setMock } = createTriageHarness({
        lockedRows: [{ id: COMPLAINT_ID, status: ComplaintStatus.TRIAGED }],
        hydratedRow: {
          id: COMPLAINT_ID,
          orderId: ORDER_ID,
          orderCode: "ORD-20261127-000001",
          orderTotalVnd: 150_000,
          orderPaymentMethod: "cod",
          orderDeliveredAt: now,
          customerId: CUSTOMER_ID,
          customerName: "Nguyen Van A",
          customerPhone: "0912345678",
          reason: "Rau bị dập nát khi giao hàng",
          proofImageUrls: [VALID_IMAGE_URL],
          proofVideoUrl: null,
          status: ComplaintStatus.REJECTED,
          resolution: null,
          triagedBy: STAFF_ID,
          triagedAt: now,
          triageNote: "Quản trị viên từ chối sau khi rà soát",
          resolvedBy: null,
          resolvedAt: null,
          resolutionNote: null,
          refundChannel: null,
          refundAmountVnd: null,
          replacementOrderId: null,
          createdAt: now,
          updatedAt: now,
        },
      });

      const result = await service.triageComplaint(
        STAFF_ID,
        UserRole.ADMIN,
        COMPLAINT_ID,
        {
          status: ComplaintStatus.REJECTED,
          triageNote: "Quản trị viên từ chối sau khi rà soát",
        },
        now,
      );

      expect(setMock).toHaveBeenCalledWith({
        status: ComplaintStatus.REJECTED,
        triagedBy: STAFF_ID,
        triagedAt: now,
        triageNote: "Quản trị viên từ chối sau khi rà soát",
        updatedAt: now,
      });
      expect(result.status).toBe(ComplaintStatus.REJECTED);
    });

    it("transitions pending complaint to triaged and normalizes empty note to null", async () => {
      // Invariant: INV-CMP-6, INV-CMP-7
      const now = new Date("2026-11-27T02:00:00.000Z");
      const { service, setMock } = createTriageHarness({
        lockedRows: [{ id: COMPLAINT_ID, status: ComplaintStatus.PENDING }],
        hydratedRow: {
          id: COMPLAINT_ID,
          orderId: ORDER_ID,
          orderCode: "ORD-20261127-000001",
          orderTotalVnd: 150_000,
          orderPaymentMethod: "cod",
          orderDeliveredAt: now,
          customerId: CUSTOMER_ID,
          customerName: "Nguyen Van A",
          customerPhone: "0912345678",
          reason: "Rau bị dập nát khi giao hàng",
          proofImageUrls: [VALID_IMAGE_URL],
          proofVideoUrl: null,
          status: ComplaintStatus.TRIAGED,
          resolution: null,
          triagedBy: STAFF_ID,
          triagedAt: now,
          triageNote: null,
          resolvedBy: null,
          resolvedAt: null,
          resolutionNote: null,
          refundChannel: null,
          refundAmountVnd: null,
          replacementOrderId: null,
          createdAt: now,
          updatedAt: now,
        },
      });

      const result = await service.triageComplaint(
        STAFF_ID,
        UserRole.SALES,
        COMPLAINT_ID,
        { status: ComplaintStatus.TRIAGED, triageNote: "" },
        now,
      );

      expect(setMock).toHaveBeenCalledWith({
        status: ComplaintStatus.TRIAGED,
        triagedBy: STAFF_ID,
        triagedAt: now,
        triageNote: null,
        updatedAt: now,
      });
      expect(result.status).toBe(ComplaintStatus.TRIAGED);
      expect(result.triagedBy).toBe(STAFF_ID);
      expect(result.triageNote).toBeNull();
    });
  });

  describe("resolveComplaintSchema", () => {
    it("accepts bank_transfer refund with sanitized note and referenceCode", () => {
      const parsed = resolveComplaintSchema.parse({
        resolution: ComplaintResolution.REFUND,
        refundChannel: ComplaintRefundChannel.BANK_TRANSFER,
        refundAmountVnd: 50_000,
        referenceCode: "  <b>FT26331001</b>  ",
        resolutionNote: "  <script>x</script>Hoàn tiền một phần  ",
      });

      expect(parsed.refundChannel).toBe(ComplaintRefundChannel.BANK_TRANSFER);
      expect(parsed.refundAmountVnd).toBe(50_000);
      expect(parsed.referenceCode).toBe("FT26331001");
      expect(parsed.resolutionNote).toBe("Hoàn tiền một phần");
    });

    it("rejects refund without refundChannel or with replacement items", () => {
      expect(
        resolveComplaintSchema.safeParse({
          resolution: ComplaintResolution.REFUND,
        }).success,
      ).toBe(false);

      expect(
        resolveComplaintSchema.safeParse({
          resolution: ComplaintResolution.REFUND,
          refundChannel: ComplaintRefundChannel.LOYALTY_POINTS,
          items: [{ productId: ORDER_ID, quantity: 1 }],
        }).success,
      ).toBe(false);
    });

    it("rejects replacement with refund fields or duplicate productIds", () => {
      expect(
        resolveComplaintSchema.safeParse({
          resolution: ComplaintResolution.REPLACEMENT,
          refundChannel: ComplaintRefundChannel.BANK_TRANSFER,
        }).success,
      ).toBe(false);

      expect(
        resolveComplaintSchema.safeParse({
          resolution: ComplaintResolution.REPLACEMENT,
          items: [
            { productId: ORDER_ID, quantity: 1 },
            { productId: ORDER_ID, quantity: 2 },
          ],
        }).success,
      ).toBe(false);
    });
  });

  describe("resolveComplaint", () => {
    const ADMIN_ID = "019fa8bc-8f4d-7000-b366-e691f45cfb96";

    function createResolveHarness(options: {
      lockedComplaints: {
        id: string;
        orderId: string;
        customerId: string;
        status: ComplaintStatus;
      }[];
      lockedOrders?: {
        id: string;
        customerId: string;
        receiverName: string;
        receiverPhone: string;
        shippingAddress: string;
        shippingDistanceKm: string;
        totalAmount: number;
        loyaltyPointsUsed: number;
        paymentMethod: PaymentMethod;
        paymentStatus: PaymentStatus;
      }[];
    }) {
      let selectIndex = 0;
      const txMock = {
        select: () => ({
          from: () => ({
            where: () => ({
              for: () => {
                selectIndex += 1;
                if (selectIndex === 1) {
                  return Promise.resolve(options.lockedComplaints);
                }
                return Promise.resolve(options.lockedOrders ?? []);
              },
            }),
          }),
        }),
      };

      const dbMock = {
        transaction: mock(async (fn: (tx: typeof txMock) => Promise<unknown>) =>
          fn(txMock),
        ),
      } as unknown as DrizzleDB;

      const service = new ComplaintsService(
        dbMock,
        {} as unknown as CloudinaryService,
      );
      return { service };
    }

    it("throws not-found when complaint does not exist", async () => {
      const { service } = createResolveHarness({ lockedComplaints: [] });

      let caught: unknown;
      try {
        await service.resolveComplaint(ADMIN_ID, COMPLAINT_ID, {
          resolution: ComplaintResolution.REFUND,
          refundChannel: ComplaintRefundChannel.LOYALTY_POINTS,
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(NotFoundException);
    });

    it("rejects resolution when complaint is not in triaged status", async () => {
      // Invariant: INV-CMP-9
      const { service } = createResolveHarness({
        lockedComplaints: [
          {
            id: COMPLAINT_ID,
            orderId: ORDER_ID,
            customerId: CUSTOMER_ID,
            status: ComplaintStatus.PENDING,
          },
        ],
      });

      let caught: unknown;
      try {
        await service.resolveComplaint(ADMIN_ID, COMPLAINT_ID, {
          resolution: ComplaintResolution.REPLACEMENT,
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toMatchObject({
        response: { code: API_ERROR_CODES.COMPLAINT_INVALID_STATUS_TRANSITION },
      });
    });

    it("rejects refund when order paymentStatus is not paid", async () => {
      // Invariant: INV-CMP-11
      const { service } = createResolveHarness({
        lockedComplaints: [
          {
            id: COMPLAINT_ID,
            orderId: ORDER_ID,
            customerId: CUSTOMER_ID,
            status: ComplaintStatus.TRIAGED,
          },
        ],
        lockedOrders: [
          {
            id: ORDER_ID,
            customerId: CUSTOMER_ID,
            receiverName: "Nguyen Van A",
            receiverPhone: "0912345678",
            shippingAddress: "123 Le Loi",
            shippingDistanceKm: "3.50",
            totalAmount: 150_000,
            loyaltyPointsUsed: 0,
            paymentMethod: PaymentMethod.COD,
            paymentStatus: PaymentStatus.PENDING,
          },
        ],
      });

      let caught: unknown;
      try {
        await service.resolveComplaint(ADMIN_ID, COMPLAINT_ID, {
          resolution: ComplaintResolution.REFUND,
          refundChannel: ComplaintRefundChannel.BANK_TRANSFER,
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toMatchObject({
        response: { code: API_ERROR_CODES.COMPLAINT_ORDER_NOT_PAID },
      });
    });

    it("rejects refund when refundAmountVnd exceeds order totalAmount", async () => {
      // Invariant: INV-CMP-11
      const { service } = createResolveHarness({
        lockedComplaints: [
          {
            id: COMPLAINT_ID,
            orderId: ORDER_ID,
            customerId: CUSTOMER_ID,
            status: ComplaintStatus.TRIAGED,
          },
        ],
        lockedOrders: [
          {
            id: ORDER_ID,
            customerId: CUSTOMER_ID,
            receiverName: "Nguyen Van A",
            receiverPhone: "0912345678",
            shippingAddress: "123 Le Loi",
            shippingDistanceKm: "3.50",
            totalAmount: 150_000,
            loyaltyPointsUsed: 0,
            paymentMethod: PaymentMethod.PAYOS,
            paymentStatus: PaymentStatus.PAID,
          },
        ],
      });

      let caught: unknown;
      try {
        await service.resolveComplaint(ADMIN_ID, COMPLAINT_ID, {
          resolution: ComplaintResolution.REFUND,
          refundChannel: ComplaintRefundChannel.LOYALTY_POINTS,
          refundAmountVnd: 150_001,
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toMatchObject({
        response: { code: API_ERROR_CODES.COMPLAINT_REFUND_AMOUNT_INVALID },
      });
    });
  });
});
