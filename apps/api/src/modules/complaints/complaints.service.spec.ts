import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { describe, expect, it, mock } from "bun:test";
import {
  API_ERROR_CODES,
  ComplaintResolution,
  ComplaintStatus,
  OrderStatus,
} from "@greenroots/shared";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import { env } from "@/common/config/env.config";
import type { DrizzleDB } from "@/database/database.module";
import type { CloudinaryService } from "@/modules/media/cloudinary.service";
import { ComplaintsService } from "./complaints.service";
import { createComplaintSchema } from "./dto";

const ORDER_ID = "019fa8bc-8f4d-7000-b366-e691f45cfb91";
const CUSTOMER_ID = "019fa8bc-8f4d-7000-b366-e691f45cfb92";
const OTHER_CUSTOMER_ID = "019fa8bc-8f4d-7000-b366-e691f45cfb93";
const COMPLAINT_ID = "019fa8bc-8f4d-7000-b366-e691f45cfb94";

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

function createServiceHarness(options: {
  orderRows: {
    id: string;
    customerId: string;
    orderStatus: OrderStatus;
    deliveredAt: Date | null;
  }[];
  existingComplaintRows?: { id: string }[];
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
        reason: "Rau bị dập nát khi giao hàng",
        proofImageUrls: [VALID_IMAGE_URL],
        proofVideoUrl: VALID_VIDEO_URL,
        status: ComplaintStatus.PENDING,
        resolution: null as ComplaintResolution | null,
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
      return createSelectChain(options.existingComplaintRows ?? []);
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
        reason: "  <b>Rau</b>   bị dập nát khi giao hàng  ",
        proofImageUrls: [VALID_IMAGE_URL],
      });

      expect(parsed.reason).toBe("Rau bị dập nát khi giao hàng");
    });

    it("rejects duplicate proof image URLs and non-complaints folders", () => {
      const duplicateResult = createComplaintSchema.safeParse({
        reason: "Rau bị dập nát khi giao hàng",
        proofImageUrls: [VALID_IMAGE_URL, VALID_IMAGE_URL],
      });
      expect(duplicateResult.success).toBe(false);

      const wrongFolderResult = createComplaintSchema.safeParse({
        reason: "Rau bị dập nát khi giao hàng",
        proofImageUrls: [
          `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/v1/products/item.webp`,
        ],
      });
      expect(wrongFolderResult.success).toBe(false);
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
});
