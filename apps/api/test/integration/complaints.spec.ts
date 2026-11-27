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
import type { PaginationMetaDto } from "@/common/dto/api-response.dto";
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
type StaffComplaintResponse = components["schemas"]["StaffComplaintDto"];

const VALID_IMAGE_URL = `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/v1/complaints/damage-1.webp`;
const VALID_VIDEO_URL = `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/video/upload/v1/complaints/clip.mp4`;

describe("Complaints Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;
  let jwtService: JwtService;

  let customerId: string;
  let otherCustomerId: string;
  let customerHeader: { Authorization: string };
  let otherCustomerHeader: { Authorization: string };
  let salesId: string;
  let salesHeader: { Authorization: string };
  let adminHeader: { Authorization: string };
  let superAdminHeader: { Authorization: string };
  let farmStaffHeader: { Authorization: string };
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
      fullName: "Tran Thi B",
      phone: "0987654321",
    });
    otherCustomerId = otherCustomer.user.id;
    otherCustomerHeader = otherCustomer.authHeader;

    const sales = await createAuthenticatedAdmin(
      setup.db,
      jwtService,
      UserRole.SALES,
    );
    salesId = sales.user.id;
    salesHeader = sales.authHeader;

    const admin = await createAuthenticatedAdmin(
      setup.db,
      jwtService,
      UserRole.ADMIN,
    );
    adminHeader = admin.authHeader;

    const superAdmin = await createAuthenticatedAdmin(
      setup.db,
      jwtService,
      UserRole.SUPER_ADMIN,
    );
    superAdminHeader = superAdmin.authHeader;

    const farmStaff = await createAuthenticatedAdmin(
      setup.db,
      jwtService,
      UserRole.FARM_STAFF,
    );
    farmStaffHeader = farmStaff.authHeader;

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

    it("omits internal staff attribution fields from customer ComplaintDto", async () => {
      // Invariant: INV-CMP-8
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
          reason: "Kiểm tra cô lập trường nội bộ trên DTO khách hàng",
          proofImageUrls: [VALID_IMAGE_URL],
        })
        .expect(201);

      const body = res.body as ApiResponse<Record<string, unknown>>;
      expect(body.data).not.toHaveProperty("triagedBy");
      expect(body.data).not.toHaveProperty("triagedAt");
      expect(body.data).not.toHaveProperty("triageNote");
      expect(body.data).not.toHaveProperty("resolvedBy");
    });
  });

  describe("GET /api/v1/complaints", () => {
    it("permits sales, admin, and super_admin and rejects non-triage roles", async () => {
      // Invariant: INV-CMP-5
      await request(app.getHttpServer()).get("/api/v1/complaints").expect(401);
      await request(app.getHttpServer())
        .get("/api/v1/complaints")
        .set(customerHeader)
        .expect(403);
      await request(app.getHttpServer())
        .get("/api/v1/complaints")
        .set(farmStaffHeader)
        .expect(403);

      await request(app.getHttpServer())
        .get("/api/v1/complaints")
        .set(salesHeader)
        .expect(200);
      await request(app.getHttpServer())
        .get("/api/v1/complaints")
        .set(adminHeader)
        .expect(200);
      await request(app.getHttpServer())
        .get("/api/v1/complaints")
        .set(superAdminHeader)
        .expect(200);
    });

    it("returns paginated hydrated staff projections sorted newest first and supports filters", async () => {
      // Invariant: INV-CMP-8
      const { order: order1 } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.DELIVERED,
        deliveredAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
        items: [{ productId, quantity: "1.00", unitPrice: 50_000 }],
      });
      const { order: order2 } = await createOrder(setup.db, {
        customerId: otherCustomerId,
        orderStatus: OrderStatus.DELIVERED,
        deliveredAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        items: [{ productId, quantity: "2.00", unitPrice: 60_000 }],
      });

      const t1 = new Date("2026-11-26T10:00:00.000Z");
      const t2 = new Date("2026-11-27T10:00:00.000Z");

      await setup.db.insert(complaints).values([
        {
          orderId: order1.id,
          customerId,
          reason: "Khiếu nại đơn một bị dập",
          proofImageUrls: [VALID_IMAGE_URL],
          status: ComplaintStatus.PENDING,
          createdAt: t1,
          updatedAt: t1,
        },
        {
          orderId: order2.id,
          customerId: otherCustomerId,
          reason: "Khiếu nại đơn hai giao thiếu",
          proofImageUrls: [VALID_IMAGE_URL],
          status: ComplaintStatus.TRIAGED,
          triagedBy: salesId,
          triagedAt: t2,
          triageNote: "Đã xác minh với kho",
          createdAt: t2,
          updatedAt: t2,
        },
      ]);

      const listRes = await request(app.getHttpServer())
        .get("/api/v1/complaints?page=1&limit=10")
        .set(salesHeader)
        .expect(200);

      const listBody = listRes.body as ApiResponse<
        StaffComplaintResponse[],
        PaginationMetaDto
      >;
      expect(listBody.data).toHaveLength(2);
      expect(listBody.meta?.total).toBe(2);
      expect(listBody.data[0]?.orderId).toBe(order2.id);
      expect(listBody.data[0]?.orderCode).toBe(order2.orderCode);
      expect(listBody.data[0]?.customerName).toBe("Tran Thi B");
      expect(listBody.data[0]?.customerPhone).toBe("0987654321");
      expect(listBody.data[0]?.triagedBy).toBe(salesId);
      expect(listBody.data[0]?.triageNote).toBe("Đã xác minh với kho");
      expect(listBody.data[1]?.orderId).toBe(order1.id);

      const byStatus = await request(app.getHttpServer())
        .get(`/api/v1/complaints?status=${ComplaintStatus.TRIAGED}`)
        .set(salesHeader)
        .expect(200);
      expect(
        (byStatus.body as ApiResponse<StaffComplaintResponse[]>).data,
      ).toHaveLength(1);

      const bySearch = await request(app.getHttpServer())
        .get(`/api/v1/complaints?search=${encodeURIComponent("0987654321")}`)
        .set(salesHeader)
        .expect(200);
      const searchData = (
        bySearch.body as ApiResponse<StaffComplaintResponse[]>
      ).data;
      expect(searchData).toHaveLength(1);
      expect(searchData[0]?.orderId).toBe(order2.id);
    });
  });

  describe("PATCH /api/v1/complaints/:id/triage", () => {
    it("permits sales, admin, and super_admin and rejects non-triage roles", async () => {
      // Invariant: INV-CMP-5
      const seedPendingComplaint = async () => {
        const { order } = await createOrder(setup.db, {
          customerId,
          orderStatus: OrderStatus.DELIVERED,
          deliveredAt: new Date(Date.now() - 60 * 60 * 1000),
          items: [{ productId, quantity: "1.00", unitPrice: 50_000 }],
        });
        const [created] = await setup.db
          .insert(complaints)
          .values({
            orderId: order.id,
            customerId,
            reason: "Kiểm tra phân quyền triage",
            proofImageUrls: [VALID_IMAGE_URL],
          })
          .returning({ id: complaints.id });
        return created!.id;
      };

      const [salesTargetId, adminTargetId, superAdminTargetId] =
        await Promise.all([
          seedPendingComplaint(),
          seedPendingComplaint(),
          seedPendingComplaint(),
        ]);

      await request(app.getHttpServer())
        .patch(`/api/v1/complaints/${salesTargetId}/triage`)
        .send({ status: ComplaintStatus.TRIAGED })
        .expect(401);

      await request(app.getHttpServer())
        .patch(`/api/v1/complaints/${salesTargetId}/triage`)
        .set(customerHeader)
        .send({ status: ComplaintStatus.TRIAGED })
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/api/v1/complaints/${salesTargetId}/triage`)
        .set(farmStaffHeader)
        .send({ status: ComplaintStatus.TRIAGED })
        .expect(403);

      await request(app.getHttpServer())
        .patch(`/api/v1/complaints/${salesTargetId}/triage`)
        .set(salesHeader)
        .send({ status: ComplaintStatus.TRIAGED })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/complaints/${adminTargetId}/triage`)
        .set(adminHeader)
        .send({ status: ComplaintStatus.TRIAGED })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/complaints/${superAdminTargetId}/triage`)
        .set(superAdminHeader)
        .send({ status: ComplaintStatus.TRIAGED })
        .expect(200);
    });

    it("transitions pending complaint to triaged and blocks subsequent triage", async () => {
      // Invariant: INV-CMP-6
      const { order } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.DELIVERED,
        deliveredAt: new Date(Date.now() - 60 * 60 * 1000),
        items: [{ productId, quantity: "1.00", unitPrice: 50_000 }],
      });

      const [created] = await setup.db
        .insert(complaints)
        .values({
          orderId: order.id,
          customerId,
          reason: "Rau bị héo khi giao tới",
          proofImageUrls: [VALID_IMAGE_URL],
        })
        .returning({ id: complaints.id });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/complaints/${created!.id}/triage`)
        .set(salesHeader)
        .send({ status: ComplaintStatus.TRIAGED })
        .expect(200);

      const body = res.body as ApiResponse<StaffComplaintResponse>;
      expect(body.data.status).toBe(ComplaintStatus.TRIAGED);
      expect(body.data.triagedBy).toBe(salesId);
      expect(body.data.triagedAt).not.toBeNull();
      expect(body.data.triageNote).toBeNull();

      const secondRes = await request(app.getHttpServer())
        .patch(`/api/v1/complaints/${created!.id}/triage`)
        .set(salesHeader)
        .send({
          status: ComplaintStatus.REJECTED,
          triageNote: "Không thể chuyển từ triaged sang rejected",
        })
        .expect(422);

      expect((secondRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.COMPLAINT_INVALID_STATUS_TRANSITION,
      );
    });

    it("requires valid HTML-stripped triageNote when rejecting a pending complaint", async () => {
      // Invariant: INV-CMP-7
      const { order } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.DELIVERED,
        deliveredAt: new Date(Date.now() - 60 * 60 * 1000),
        items: [{ productId, quantity: "1.00", unitPrice: 50_000 }],
      });

      const [created] = await setup.db
        .insert(complaints)
        .values({
          orderId: order.id,
          customerId,
          reason: "Ảnh minh chứng không khớp đơn hàng",
          proofImageUrls: [VALID_IMAGE_URL],
        })
        .returning({ id: complaints.id });

      await request(app.getHttpServer())
        .patch(`/api/v1/complaints/${created!.id}/triage`)
        .set(salesHeader)
        .send({ status: ComplaintStatus.REJECTED, triageNote: "<b>abc</b>" })
        .expect(400);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/complaints/${created!.id}/triage`)
        .set(salesHeader)
        .send({
          status: ComplaintStatus.REJECTED,
          triageNote: "  <b>Ảnh</b> không phải sản phẩm của nông trại  ",
        })
        .expect(200);

      const body = res.body as ApiResponse<StaffComplaintResponse>;
      expect(body.data.status).toBe(ComplaintStatus.REJECTED);
      expect(body.data.triageNote).toBe(
        "Ảnh không phải sản phẩm của nông trại",
      );
    });

    it("returns not-found when complaint does not exist", async () => {
      const missingId = "019fa8bc-8f4d-7000-b366-e691f45cffff";
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/complaints/${missingId}/triage`)
        .set(salesHeader)
        .send({ status: ComplaintStatus.TRIAGED })
        .expect(404);

      expect((res.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.COMPLAINT_NOT_FOUND,
      );
    });

    it("allows only one triage under concurrent requests for the same pending complaint", async () => {
      // Invariant: INV-CMP-6
      const { order } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.DELIVERED,
        deliveredAt: new Date(Date.now() - 60 * 60 * 1000),
        items: [{ productId, quantity: "1.00", unitPrice: 50_000 }],
      });

      const [created] = await setup.db
        .insert(complaints)
        .values({
          orderId: order.id,
          customerId,
          reason: "Kiểm tra khóa hàng FOR UPDATE khi triage đồng thời",
          proofImageUrls: [VALID_IMAGE_URL],
        })
        .returning({ id: complaints.id });

      const [first, second] = await Promise.all([
        request(app.getHttpServer())
          .patch(`/api/v1/complaints/${created!.id}/triage`)
          .set(salesHeader)
          .send({ status: ComplaintStatus.TRIAGED }),
        request(app.getHttpServer())
          .patch(`/api/v1/complaints/${created!.id}/triage`)
          .set(adminHeader)
          .send({
            status: ComplaintStatus.REJECTED,
            triageNote: "Từ chối đồng thời để kiểm tra lock",
          }),
      ]);

      const statuses = [first.status, second.status].sort((a, b) => a - b);
      expect(statuses).toEqual([200, 422]);
    });
  });
});
