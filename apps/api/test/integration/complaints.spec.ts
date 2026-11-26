import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  spyOn,
} from "bun:test";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UnprocessableEntityException } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import {
  API_ERROR_CODES,
  ComplaintStatus,
  OrderStatus,
  PaymentStatus,
  UserRole,
} from "@greenroots/shared";
import { env } from "@/common/config/env.config";
import type { Rfc9457ProblemDetails } from "@/common/filters/global-exception.filter";
import type { ApiResponse } from "@/common/utils/api-response.util";
import { complaints, orders } from "@/database/schemas";
import { CloudinaryService } from "@/modules/media/cloudinary.service";
import { createCategory, createOrder, createProduct } from "../factories";
import type { components } from "../generated/api-schema";
import {
  cleanScopedRedisKeys,
  createTestApp,
  teardownTestApp,
  type TestAppSetup,
} from "../helpers/app.helper";
import {
  createAuthenticatedAdmin,
  createAuthenticatedUser,
} from "../helpers/auth.helper";

type ComplaintResponse = components["schemas"]["ComplaintDto"];

const VALID_IMAGE_URL = `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/v1/complaints/damage-1.webp`;
const VALID_VIDEO_URL = `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/video/upload/v1/complaints/clip.mp4`;

describe("Complaints Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;
  let jwtService: JwtService;

  let customerId: string;
  let customerHeader: { Authorization: string };
  let otherCustomerHeader: { Authorization: string };
  let salesHeader: { Authorization: string };
  let productId: string;

  let verifySpy:
    | ReturnType<typeof spyOn<CloudinaryService, "verifyComplaintMedia">>
    | undefined;

  beforeAll(async () => {
    setup = await createTestApp();
    app = setup.app;
    jwtService = app.get(JwtService);
  });

  beforeEach(async () => {
    await setup.db.execute(
      sql`TRUNCATE TABLE "complaints", "payments", "batch_allocations", "order_items", "orders", "products", "categories", "users" CASCADE;`,
    );
    await cleanScopedRedisKeys(setup.redisClient);

    const customer = await createAuthenticatedUser(setup.db, jwtService, {
      email: "complaint-customer@greenroots.vn",
    });
    customerId = customer.user.id;
    customerHeader = customer.authHeader;

    const otherCustomer = await createAuthenticatedUser(setup.db, jwtService, {
      email: "complaint-other@greenroots.vn",
    });
    otherCustomerHeader = otherCustomer.authHeader;

    const sales = await createAuthenticatedAdmin(
      setup.db,
      jwtService,
      UserRole.SALES,
    );
    salesHeader = sales.authHeader;

    const category = await createCategory(setup.db);
    const product = await createProduct(setup.db, { categoryId: category.id });
    productId = product.id;
  });

  afterEach(() => {
    verifySpy?.mockRestore();
    verifySpy = undefined;
  });

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  describe("POST /api/v1/orders/:id/complaints", () => {
    it("creates a pending complaint for an owned delivered order within 24 hours", async () => {
      // Invariant: INV-CMP-2
      const { order } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.DELIVERED,
        deliveredAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        items: [{ productId, quantity: "2.00", unitPrice: 30_000 }],
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/complaints`)
        .set(customerHeader)
        .send({
          reason: "  <b>Rau</b>   cải bị dập khi nhận hàng  ",
          proofImageUrls: [VALID_IMAGE_URL],
          proofVideoUrl: VALID_VIDEO_URL,
        })
        .expect(201);

      const body = res.body as ApiResponse<ComplaintResponse>;
      expect(body.success).toBe(true);
      expect(body.data.orderId).toBe(order.id);
      expect(body.data.customerId).toBe(customerId);
      expect(body.data.status).toBe(ComplaintStatus.PENDING);
      expect(body.data.resolution).toBeNull();
      expect(body.data.reason).toBe("Rau cải bị dập khi nhận hàng");
      expect(body.data.proofImageUrls).toEqual([VALID_IMAGE_URL]);
      expect(body.data.proofVideoUrl).toBe(VALID_VIDEO_URL);

      const [persisted] = await setup.db
        .select()
        .from(complaints)
        .where(eq(complaints.orderId, order.id));
      expect(persisted?.id).toBe(body.data.id);
    });

    it("stamps deliveredAt on shipping-to-delivered transition and allows complaint after completed within 24h", async () => {
      // Invariant: INV-CMP-2
      const { order } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.SHIPPING,
        paymentStatus: PaymentStatus.PAID,
        items: [{ productId, quantity: "1.00", unitPrice: 50_000 }],
      });

      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${order.id}/status`)
        .set(salesHeader)
        .send({ status: OrderStatus.DELIVERED })
        .expect(200);

      const [afterDelivered] = await setup.db
        .select({ deliveredAt: orders.deliveredAt })
        .from(orders)
        .where(eq(orders.id, order.id));
      expect(afterDelivered?.deliveredAt).toBeInstanceOf(Date);

      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${order.id}/status`)
        .set(salesHeader)
        .send({ status: OrderStatus.COMPLETED })
        .expect(200);

      const [afterCompleted] = await setup.db
        .select({ deliveredAt: orders.deliveredAt })
        .from(orders)
        .where(eq(orders.id, order.id));
      expect(afterCompleted?.deliveredAt?.getTime()).toBe(
        afterDelivered?.deliveredAt?.getTime(),
      );

      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/complaints`)
        .set(customerHeader)
        .send({
          reason: "Sản phẩm giao thiếu số lượng đặt mua",
          proofImageUrls: [VALID_IMAGE_URL],
        })
        .expect(201);

      const body = res.body as ApiResponse<ComplaintResponse>;
      expect(body.data.status).toBe(ComplaintStatus.PENDING);
    });

    it("returns not-found when order belongs to another customer", async () => {
      // Invariant: INV-CMP-1
      const { order } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.DELIVERED,
        deliveredAt: new Date(Date.now() - 60 * 60 * 1000),
        items: [{ productId, quantity: "1.00", unitPrice: 50_000 }],
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/complaints`)
        .set(otherCustomerHeader)
        .send({
          reason: "Không phải chủ đơn hàng nhưng thử gửi khiếu nại",
          proofImageUrls: [VALID_IMAGE_URL],
        })
        .expect(404);

      const body = res.body as Rfc9457ProblemDetails;
      expect(body.code).toBe(API_ERROR_CODES.ORDER_NOT_FOUND);
    });

    it("rejects complaint when order is not delivered or completed", async () => {
      const { order } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.SHIPPING,
        paymentStatus: PaymentStatus.PAID,
        items: [{ productId, quantity: "1.00", unitPrice: 50_000 }],
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/complaints`)
        .set(customerHeader)
        .send({
          reason: "Đơn đang giao chưa thể khiếu nại",
          proofImageUrls: [VALID_IMAGE_URL],
        })
        .expect(422);

      const body = res.body as Rfc9457ProblemDetails;
      expect(body.code).toBe(API_ERROR_CODES.ORDER_COMPLAINT_NOT_ELIGIBLE);
    });

    it("rejects complaint submitted more than 24 hours after deliveredAt", async () => {
      // Invariant: INV-CMP-2
      const { order } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.DELIVERED,
        deliveredAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        items: [{ productId, quantity: "1.00", unitPrice: 50_000 }],
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/complaints`)
        .set(customerHeader)
        .send({
          reason: "Gửi khiếu nại sau khi đã quá hạn 24 giờ",
          proofImageUrls: [VALID_IMAGE_URL],
        })
        .expect(422);

      const body = res.body as Rfc9457ProblemDetails;
      expect(body.code).toBe(API_ERROR_CODES.ORDER_COMPLAINT_WINDOW_EXPIRED);
    });

    it("rejects duplicate complaint submission for the same order", async () => {
      // Invariant: INV-CMP-3
      const { order } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.DELIVERED,
        deliveredAt: new Date(Date.now() - 60 * 60 * 1000),
        items: [{ productId, quantity: "1.00", unitPrice: 50_000 }],
      });

      await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/complaints`)
        .set(customerHeader)
        .send({
          reason: "Khiếu nại lần thứ nhất cho đơn hàng",
          proofImageUrls: [VALID_IMAGE_URL],
        })
        .expect(201);

      const duplicateRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/complaints`)
        .set(customerHeader)
        .send({
          reason: "Khiếu nại lần thứ hai cho cùng đơn hàng",
          proofImageUrls: [VALID_IMAGE_URL],
        })
        .expect(409);

      const body = duplicateRes.body as Rfc9457ProblemDetails;
      expect(body.code).toBe(API_ERROR_CODES.ORDER_COMPLAINT_ALREADY_EXISTS);
    });

    it("rejects staff role from customer complaint endpoint", async () => {
      const { order } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.DELIVERED,
        deliveredAt: new Date(Date.now() - 60 * 60 * 1000),
        items: [{ productId, quantity: "1.00", unitPrice: 50_000 }],
      });

      await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/complaints`)
        .set(salesHeader)
        .send({
          reason: "Nhân viên không được gọi endpoint của khách",
          proofImageUrls: [VALID_IMAGE_URL],
        })
        .expect(403);
    });

    it("rejects invalid media constraints reported by server-side Cloudinary verification", async () => {
      // Invariant: INV-CMP-4
      const { order } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.DELIVERED,
        deliveredAt: new Date(Date.now() - 60 * 60 * 1000),
        items: [{ productId, quantity: "1.00", unitPrice: 50_000 }],
      });

      const cloudinaryService = app.get(CloudinaryService);
      verifySpy = spyOn(
        cloudinaryService,
        "verifyComplaintMedia",
      ).mockRejectedValueOnce(
        new UnprocessableEntityException({
          code: API_ERROR_CODES.COMPLAINT_MEDIA_INVALID,
          detail: "Video exceeds 15s duration limit.",
        }),
      );

      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/complaints`)
        .set(customerHeader)
        .send({
          reason: "Video vượt quá giới hạn 15 giây cho phép",
          proofImageUrls: [VALID_IMAGE_URL],
          proofVideoUrl: VALID_VIDEO_URL,
        })
        .expect(422);

      const body = res.body as Rfc9457ProblemDetails;
      expect(body.code).toBe(API_ERROR_CODES.COMPLAINT_MEDIA_INVALID);
    });

    it("rejects unauthenticated requests", async () => {
      const { order } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.DELIVERED,
        deliveredAt: new Date(Date.now() - 60 * 60 * 1000),
        items: [{ productId, quantity: "1.00", unitPrice: 50_000 }],
      });

      await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/complaints`)
        .send({
          reason: "Yêu cầu chưa đăng nhập không thể gửi khiếu nại",
          proofImageUrls: [VALID_IMAGE_URL],
        })
        .expect(401);
    });

    it("rejects invalid DTO payload with structured validation parameters", async () => {
      const { order } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.DELIVERED,
        deliveredAt: new Date(Date.now() - 60 * 60 * 1000),
        items: [{ productId, quantity: "1.00", unitPrice: 50_000 }],
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/complaints`)
        .set(customerHeader)
        .send({
          reason: "Quá ngắn",
          proofImageUrls: [],
          unexpectedField: true,
        })
        .expect(400);

      const body = res.body as Rfc9457ProblemDetails;
      expect(body.invalidParams.length).toBeGreaterThanOrEqual(2);
    });

    it("allows only one complaint under concurrent submissions for the same order", async () => {
      // Invariant: INV-CMP-3
      const { order } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.DELIVERED,
        deliveredAt: new Date(Date.now() - 60 * 60 * 1000),
        items: [{ productId, quantity: "1.00", unitPrice: 50_000 }],
      });

      const [first, second] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/orders/${order.id}/complaints`)
          .set(customerHeader)
          .send({
            reason: "Gửi khiếu nại đồng thời lần một",
            proofImageUrls: [VALID_IMAGE_URL],
          }),
        request(app.getHttpServer())
          .post(`/api/v1/orders/${order.id}/complaints`)
          .set(customerHeader)
          .send({
            reason: "Gửi khiếu nại đồng thời lần hai",
            proofImageUrls: [VALID_IMAGE_URL],
          }),
      ]);

      const statuses = [first.status, second.status].sort((a, b) => a - b);
      expect(statuses).toEqual([201, 409]);
    });
  });
});
