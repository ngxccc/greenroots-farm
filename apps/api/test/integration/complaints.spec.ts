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
import { and, eq, sql } from "drizzle-orm";
import {
  API_ERROR_CODES,
  BatchStatus,
  ComplaintCategory,
  ComplaintRefundChannel,
  ComplaintResolution,
  ComplaintStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PaymentTransactionType,
  UserRole,
} from "@greenroots/shared";
import { env } from "@/common/config/env.config";
import type { Rfc9457ProblemDetails } from "@/common/filters/global-exception.filter";
import type { PaginationMetaDto } from "@/common/dto/api-response.dto";
import type { ApiResponse } from "@/common/utils/api-response.util";
import {
  batchAllocations,
  batches,
  complaints,
  orderItems,
  orders,
  payments,
  users,
} from "@/database/schemas";
import { CloudinaryService } from "@/modules/media/cloudinary.service";
import {
  createBatch,
  createCategory,
  createOrder,
  createProduct,
} from "../factories";
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
      sql`TRUNCATE TABLE "complaints", "payments", "batch_allocations", "order_items", "orders", "batches", "seasons", "plots", "farms", "products", "categories", "users" CASCADE;`,
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
      const { order, items } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.DELIVERED,
        deliveredAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        items: [{ productId, quantity: "2.00", unitPrice: 30_000 }],
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/complaints`)
        .set(customerHeader)
        .send({
          category: ComplaintCategory.DAMAGED_WILTED,
          affectedOrderItemIds: [items[0]!.id],
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
      const { order, items } = await createOrder(setup.db, {
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
          category: ComplaintCategory.MISSING_ITEM,
          affectedOrderItemIds: [items[0]!.id],
          reason: "Sản phẩm giao thiếu số lượng đặt mua",
          proofImageUrls: [VALID_IMAGE_URL],
        })
        .expect(201);

      const body = res.body as ApiResponse<ComplaintResponse>;
      expect(body.data.status).toBe(ComplaintStatus.PENDING);
    });

    it("returns not-found when order belongs to another customer", async () => {
      // Invariant: INV-CMP-1
      const { order, items } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.DELIVERED,
        deliveredAt: new Date(Date.now() - 60 * 60 * 1000),
        items: [{ productId, quantity: "1.00", unitPrice: 50_000 }],
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/complaints`)
        .set(otherCustomerHeader)
        .send({
          category: ComplaintCategory.DAMAGED_WILTED,
          affectedOrderItemIds: [items[0]!.id],
          reason: "Không phải chủ đơn hàng nhưng thử gửi khiếu nại",
          proofImageUrls: [VALID_IMAGE_URL],
        })
        .expect(404);

      const body = res.body as Rfc9457ProblemDetails;
      expect(body.code).toBe(API_ERROR_CODES.ORDER_NOT_FOUND);
    });

    it("rejects complaint when order is not delivered or completed", async () => {
      const { order, items } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.SHIPPING,
        paymentStatus: PaymentStatus.PAID,
        items: [{ productId, quantity: "1.00", unitPrice: 50_000 }],
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/complaints`)
        .set(customerHeader)
        .send({
          category: ComplaintCategory.DAMAGED_WILTED,
          affectedOrderItemIds: [items[0]!.id],
          reason: "Đơn đang giao chưa thể khiếu nại",
          proofImageUrls: [VALID_IMAGE_URL],
        })
        .expect(422);

      const body = res.body as Rfc9457ProblemDetails;
      expect(body.code).toBe(API_ERROR_CODES.ORDER_COMPLAINT_NOT_ELIGIBLE);
    });

    it("rejects complaint submitted more than 24 hours after deliveredAt", async () => {
      // Invariant: INV-CMP-2
      const { order, items } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.DELIVERED,
        deliveredAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        items: [{ productId, quantity: "1.00", unitPrice: 50_000 }],
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/complaints`)
        .set(customerHeader)
        .send({
          category: ComplaintCategory.DAMAGED_WILTED,
          affectedOrderItemIds: [items[0]!.id],
          reason: "Gửi khiếu nại sau khi đã quá hạn 24 giờ",
          proofImageUrls: [VALID_IMAGE_URL],
        })
        .expect(422);

      const body = res.body as Rfc9457ProblemDetails;
      expect(body.code).toBe(API_ERROR_CODES.ORDER_COMPLAINT_WINDOW_EXPIRED);
    });

    it("rejects duplicate complaint submission for the same order", async () => {
      // Invariant: INV-CMP-3
      const { order, items } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.DELIVERED,
        deliveredAt: new Date(Date.now() - 60 * 60 * 1000),
        items: [{ productId, quantity: "1.00", unitPrice: 50_000 }],
      });

      await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/complaints`)
        .set(customerHeader)
        .send({
          category: ComplaintCategory.DAMAGED_WILTED,
          affectedOrderItemIds: [items[0]!.id],
          reason: "Khiếu nại lần thứ nhất cho đơn hàng",
          proofImageUrls: [VALID_IMAGE_URL],
        })
        .expect(201);

      const duplicateRes = await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/complaints`)
        .set(customerHeader)
        .send({
          category: ComplaintCategory.DAMAGED_WILTED,
          affectedOrderItemIds: [items[0]!.id],
          reason: "Khiếu nại lần thứ hai cho cùng đơn hàng",
          proofImageUrls: [VALID_IMAGE_URL],
        })
        .expect(409);

      const body = duplicateRes.body as Rfc9457ProblemDetails;
      expect(body.code).toBe(API_ERROR_CODES.ORDER_COMPLAINT_ALREADY_EXISTS);
    });

    it("rejects staff role from customer complaint endpoint", async () => {
      const { order, items } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.DELIVERED,
        deliveredAt: new Date(Date.now() - 60 * 60 * 1000),
        items: [{ productId, quantity: "1.00", unitPrice: 50_000 }],
      });

      await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/complaints`)
        .set(salesHeader)
        .send({
          category: ComplaintCategory.DAMAGED_WILTED,
          affectedOrderItemIds: [items[0]!.id],
          reason: "Nhân viên không được gọi endpoint của khách",
          proofImageUrls: [VALID_IMAGE_URL],
        })
        .expect(403);
    });

    it("rejects invalid media constraints reported by server-side Cloudinary verification", async () => {
      // Invariant: INV-CMP-4
      const { order, items } = await createOrder(setup.db, {
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
          category: ComplaintCategory.DAMAGED_WILTED,
          affectedOrderItemIds: [items[0]!.id],
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
      const { order, items } = await createOrder(setup.db, {
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
            category: ComplaintCategory.DAMAGED_WILTED,
            affectedOrderItemIds: [items[0]!.id],
            reason: "Gửi khiếu nại đồng thời lần một",
            proofImageUrls: [VALID_IMAGE_URL],
          }),
        request(app.getHttpServer())
          .post(`/api/v1/orders/${order.id}/complaints`)
          .set(customerHeader)
          .send({
            category: ComplaintCategory.DAMAGED_WILTED,
            affectedOrderItemIds: [items[0]!.id],
            reason: "Gửi khiếu nại đồng thời lần hai",
            proofImageUrls: [VALID_IMAGE_URL],
          }),
      ]);

      const statuses = [first.status, second.status].sort((a, b) => a - b);
      expect(statuses).toEqual([201, 409]);
    });

    it("omits internal staff attribution fields from customer ComplaintDto", async () => {
      // Invariant: INV-CMP-8
      const { order, items } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.DELIVERED,
        deliveredAt: new Date(Date.now() - 60 * 60 * 1000),
        items: [{ productId, quantity: "1.00", unitPrice: 50_000 }],
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/orders/${order.id}/complaints`)
        .set(customerHeader)
        .send({
          category: ComplaintCategory.DAMAGED_WILTED,
          affectedOrderItemIds: [items[0]!.id],
          reason: "Kiểm tra cô lập trường nội bộ trên DTO khách hàng",
          proofImageUrls: [VALID_IMAGE_URL],
        })
        .expect(201);

      const body = res.body as ApiResponse<Record<string, unknown>>;
      expect(body.data).not.toHaveProperty("triagedBy");
      expect(body.data).not.toHaveProperty("triagedAt");
      expect(body.data["triageNote"]).toBeNull();
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

      const overrideRes = await request(app.getHttpServer())
        .patch(`/api/v1/complaints/${created!.id}/triage`)
        .set(adminHeader)
        .send({
          status: ComplaintStatus.REJECTED,
          triageNote: "Quản trị viên từ chối sau khi rà soát lại",
        })
        .expect(200);

      expect(
        (overrideRes.body as ApiResponse<StaffComplaintResponse>).data.status,
      ).toBe(ComplaintStatus.REJECTED);
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
          .set(salesHeader)
          .send({
            status: ComplaintStatus.REJECTED,
            triageNote: "Từ chối đồng thời để kiểm tra lock",
          }),
      ]);

      const statuses = [first.status, second.status].sort((a, b) => a - b);
      expect(statuses).toEqual([200, 422]);
    });
  });

  describe("POST /api/v1/complaints/:id/resolve", () => {
    async function seedTriagedComplaint(options?: {
      paymentStatus?: PaymentStatus;
      paymentMethod?: PaymentMethod;
      shippingFee?: number;
      loyaltyPointsUsed?: number;
      customerRewardPoints?: number;
      items?: { productId: string; quantity: string; unitPrice: number }[];
    }) {
      if (options?.customerRewardPoints !== undefined) {
        await setup.db
          .update(users)
          .set({ rewardPoints: options.customerRewardPoints })
          .where(eq(users.id, customerId));
      }

      const { order } = await createOrder(setup.db, {
        customerId,
        orderStatus: OrderStatus.DELIVERED,
        paymentStatus: options?.paymentStatus ?? PaymentStatus.PAID,
        paymentMethod: options?.paymentMethod ?? PaymentMethod.PAYOS,
        shippingFee: options?.shippingFee ?? 0,
        loyaltyPointsUsed: options?.loyaltyPointsUsed ?? 0,
        deliveredAt: new Date(Date.now() - 60 * 60 * 1000),
        items: options?.items ?? [
          { productId, quantity: "2.00", unitPrice: 75_000 },
        ],
      });

      const [complaint] = await setup.db
        .insert(complaints)
        .values({
          orderId: order.id,
          customerId,
          reason: "Sản phẩm giao bị hư hỏng cần giải quyết",
          proofImageUrls: [VALID_IMAGE_URL],
          status: ComplaintStatus.TRIAGED,
          triagedBy: salesId,
          triagedAt: new Date(),
        })
        .returning({ id: complaints.id });

      return { order, complaintId: complaint!.id };
    }

    it("restricts resolution to admin and super_admin and requires an idempotency key", async () => {
      // Invariant: INV-CMP-9
      const { complaintId } = await seedTriagedComplaint();
      const idempotencyKey = crypto.randomUUID();
      const payload = {
        resolution: ComplaintResolution.REFUND,
        refundChannel: ComplaintRefundChannel.LOYALTY_POINTS,
      };

      await request(app.getHttpServer())
        .post(`/api/v1/complaints/${complaintId}/resolve`)
        .set("Idempotency-Key", idempotencyKey)
        .send(payload)
        .expect(401);

      await request(app.getHttpServer())
        .post(`/api/v1/complaints/${complaintId}/resolve`)
        .set(customerHeader)
        .set("Idempotency-Key", idempotencyKey)
        .send(payload)
        .expect(403);

      await request(app.getHttpServer())
        .post(`/api/v1/complaints/${complaintId}/resolve`)
        .set(farmStaffHeader)
        .set("Idempotency-Key", idempotencyKey)
        .send(payload)
        .expect(403);

      await request(app.getHttpServer())
        .post(`/api/v1/complaints/${complaintId}/resolve`)
        .set(salesHeader)
        .set("Idempotency-Key", idempotencyKey)
        .send(payload)
        .expect(403);

      await request(app.getHttpServer())
        .post(`/api/v1/complaints/${complaintId}/resolve`)
        .set(adminHeader)
        .send(payload)
        .expect(400);

      const firstRes = await request(app.getHttpServer())
        .post(`/api/v1/complaints/${complaintId}/resolve`)
        .set(adminHeader)
        .set("Idempotency-Key", idempotencyKey)
        .send(payload)
        .expect(200);

      const replayRes = await request(app.getHttpServer())
        .post(`/api/v1/complaints/${complaintId}/resolve`)
        .set(adminHeader)
        .set("Idempotency-Key", idempotencyKey)
        .send(payload)
        .expect(200);

      expect(
        (replayRes.body as ApiResponse<StaffComplaintResponse>).data,
      ).toEqual((firstRes.body as ApiResponse<StaffComplaintResponse>).data);

      await request(app.getHttpServer())
        .post(`/api/v1/complaints/${complaintId}/resolve`)
        .set(adminHeader)
        .set("Idempotency-Key", idempotencyKey)
        .send({
          resolution: ComplaintResolution.REFUND,
          refundChannel: ComplaintRefundChannel.BANK_TRANSFER,
        })
        .expect(422);
    });

    it("rejects refund when order is not paid or refundAmountVnd exceeds order total", async () => {
      // Invariant: INV-CMP-11
      const unpaid = await seedTriagedComplaint({
        paymentStatus: PaymentStatus.PENDING,
        paymentMethod: PaymentMethod.COD,
      });

      const unpaidRes = await request(app.getHttpServer())
        .post(`/api/v1/complaints/${unpaid.complaintId}/resolve`)
        .set(adminHeader)
        .set("Idempotency-Key", crypto.randomUUID())
        .send({
          resolution: ComplaintResolution.REFUND,
          refundChannel: ComplaintRefundChannel.BANK_TRANSFER,
        })
        .expect(422);

      expect((unpaidRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.COMPLAINT_ORDER_NOT_PAID,
      );

      const paid = await seedTriagedComplaint({
        paymentStatus: PaymentStatus.PAID,
        items: [{ productId, quantity: "2.00", unitPrice: 50_000 }],
      });

      const overAmountRes = await request(app.getHttpServer())
        .post(`/api/v1/complaints/${paid.complaintId}/resolve`)
        .set(adminHeader)
        .set("Idempotency-Key", crypto.randomUUID())
        .send({
          resolution: ComplaintResolution.REFUND,
          refundChannel: ComplaintRefundChannel.LOYALTY_POINTS,
          refundAmountVnd: 100_001,
        })
        .expect(422);

      expect((overAmountRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.COMPLAINT_REFUND_AMOUNT_INVALID,
      );
    });

    it("records full bank_transfer refund ledger, updates order paymentStatus, and restores loyaltyPointsUsed", async () => {
      // Invariant: INV-CMP-12
      const { order, complaintId } = await seedTriagedComplaint({
        paymentStatus: PaymentStatus.PAID,
        items: [{ productId, quantity: "2.00", unitPrice: 67_500 }],
        loyaltyPointsUsed: 15_000,
        customerRewardPoints: 1_000,
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/complaints/${complaintId}/resolve`)
        .set(superAdminHeader)
        .set("Idempotency-Key", crypto.randomUUID())
        .send({
          resolution: ComplaintResolution.REFUND,
          refundChannel: ComplaintRefundChannel.BANK_TRANSFER,
          referenceCode: "FT26331999",
          resolutionNote: "Hoàn tiền toàn phần qua chuyển khoản",
        })
        .expect(200);

      const body = res.body as ApiResponse<StaffComplaintResponse>;
      expect(body.data.status).toBe(ComplaintStatus.APPROVED);
      expect(body.data.resolution).toBe(ComplaintResolution.REFUND);
      expect(body.data.refundChannel).toBe(
        ComplaintRefundChannel.BANK_TRANSFER,
      );
      expect(body.data.refundAmountVnd).toBe(120_000);
      expect(body.data.resolvedAt).not.toBeNull();
      expect(body.data.replacementOrderId).toBeNull();

      const [updatedOrder] = await setup.db
        .select({ paymentStatus: orders.paymentStatus })
        .from(orders)
        .where(eq(orders.id, order.id));
      expect(updatedOrder?.paymentStatus).toBe(PaymentStatus.REFUNDED);

      const [refundPayment] = await setup.db
        .select({
          amount: payments.amount,
          status: payments.status,
          transactionType: payments.transactionType,
          referenceCode: payments.referenceCode,
        })
        .from(payments)
        .where(
          and(
            eq(payments.orderId, order.id),
            eq(payments.transactionType, PaymentTransactionType.REFUND),
          ),
        );
      expect(refundPayment).toEqual({
        amount: 120_000,
        status: PaymentStatus.REFUNDED,
        transactionType: PaymentTransactionType.REFUND,
        referenceCode: "FT26331999",
      });

      const [customerRow] = await setup.db
        .select({ rewardPoints: users.rewardPoints })
        .from(users)
        .where(eq(users.id, customerId));
      expect(customerRow?.rewardPoints).toBe(16_000);
    });

    it("keeps order paid on partial bank_transfer refund and isolates loyalty_points refund from payments ledger", async () => {
      // Invariant: INV-CMP-12
      const partial = await seedTriagedComplaint({
        paymentStatus: PaymentStatus.PAID,
        items: [{ productId, quantity: "2.00", unitPrice: 65_000 }],
        loyaltyPointsUsed: 10_000,
        customerRewardPoints: 500,
      });

      await request(app.getHttpServer())
        .post(`/api/v1/complaints/${partial.complaintId}/resolve`)
        .set(adminHeader)
        .set("Idempotency-Key", crypto.randomUUID())
        .send({
          resolution: ComplaintResolution.REFUND,
          refundChannel: ComplaintRefundChannel.BANK_TRANSFER,
          refundAmountVnd: 50_000,
        })
        .expect(200);

      const [partialOrder] = await setup.db
        .select({ paymentStatus: orders.paymentStatus })
        .from(orders)
        .where(eq(orders.id, partial.order.id));
      expect(partialOrder?.paymentStatus).toBe(PaymentStatus.PAID);

      const [customerAfterPartial] = await setup.db
        .select({ rewardPoints: users.rewardPoints })
        .from(users)
        .where(eq(users.id, customerId));
      expect(customerAfterPartial?.rewardPoints).toBe(500);

      const loyalty = await seedTriagedComplaint({
        paymentStatus: PaymentStatus.PAID,
        items: [{ productId, quantity: "2.00", unitPrice: 45_000 }],
        customerRewardPoints: 500,
      });

      const loyaltyRes = await request(app.getHttpServer())
        .post(`/api/v1/complaints/${loyalty.complaintId}/resolve`)
        .set(adminHeader)
        .set("Idempotency-Key", crypto.randomUUID())
        .send({
          resolution: ComplaintResolution.REFUND,
          refundChannel: ComplaintRefundChannel.LOYALTY_POINTS,
          refundAmountVnd: 40_000,
        })
        .expect(200);

      expect(
        (loyaltyRes.body as ApiResponse<StaffComplaintResponse>).data
          .refundChannel,
      ).toBe(ComplaintRefundChannel.LOYALTY_POINTS);

      const loyaltyRefundPayments = await setup.db
        .select({ id: payments.id })
        .from(payments)
        .where(
          and(
            eq(payments.orderId, loyalty.order.id),
            eq(payments.transactionType, PaymentTransactionType.REFUND),
          ),
        );
      expect(loyaltyRefundPayments).toHaveLength(0);

      const [customerAfterLoyalty] = await setup.db
        .select({ rewardPoints: users.rewardPoints })
        .from(users)
        .where(eq(users.id, customerId));
      expect(customerAfterLoyalty?.rewardPoints).toBe(40_500);
    });

    it("creates a zero-VND FEFO-allocated replacement order and rolls back on insufficient stock", async () => {
      // Invariant: INV-CMP-13
      const { complaintId } = await seedTriagedComplaint({
        items: [{ productId, quantity: "3.00", unitPrice: 50_000 }],
      });

      const insufficientRes = await request(app.getHttpServer())
        .post(`/api/v1/complaints/${complaintId}/resolve`)
        .set(adminHeader)
        .set("Idempotency-Key", crypto.randomUUID())
        .send({
          resolution: ComplaintResolution.REPLACEMENT,
        })
        .expect(422);

      expect((insufficientRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.INSUFFICIENT_STOCK,
      );

      const [stillTriaged] = await setup.db
        .select({ status: complaints.status })
        .from(complaints)
        .where(eq(complaints.id, complaintId));
      expect(stillTriaged?.status).toBe(ComplaintStatus.TRIAGED);

      const earlierBatch = await createBatch(setup.db, {
        productId,
        availableQuantity: "2.00",
        initialQuantity: "5.00",
        status: BatchStatus.IN_STOCK,
        expirationDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      });
      const laterBatch = await createBatch(setup.db, {
        productId,
        availableQuantity: "5.00",
        initialQuantity: "5.00",
        status: BatchStatus.IN_STOCK,
        expirationDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      });

      const invalidSubsetRes = await request(app.getHttpServer())
        .post(`/api/v1/complaints/${complaintId}/resolve`)
        .set(adminHeader)
        .set("Idempotency-Key", crypto.randomUUID())
        .send({
          resolution: ComplaintResolution.REPLACEMENT,
          items: [{ productId, quantity: 4 }],
        })
        .expect(422);

      expect((invalidSubsetRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.COMPLAINT_REPLACEMENT_ITEMS_INVALID,
      );

      const resolveRes = await request(app.getHttpServer())
        .post(`/api/v1/complaints/${complaintId}/resolve`)
        .set(adminHeader)
        .set("Idempotency-Key", crypto.randomUUID())
        .send({
          resolution: ComplaintResolution.REPLACEMENT,
          items: [{ productId, quantity: 3 }],
          resolutionNote: "Giao bù 3 đơn vị nông sản",
        })
        .expect(200);

      const body = resolveRes.body as ApiResponse<StaffComplaintResponse>;
      expect(body.data.status).toBe(ComplaintStatus.APPROVED);
      expect(body.data.resolution).toBe(ComplaintResolution.REPLACEMENT);
      expect(body.data.replacementOrderId).not.toBeNull();

      const [replacementOrder] = await setup.db
        .select({
          totalAmount: orders.totalAmount,
          subtotal: orders.subtotal,
          shippingFee: orders.shippingFee,
          paymentMethod: orders.paymentMethod,
          paymentStatus: orders.paymentStatus,
          orderStatus: orders.orderStatus,
        })
        .from(orders)
        .where(eq(orders.id, body.data.replacementOrderId!));

      expect(replacementOrder).toEqual({
        totalAmount: 0,
        subtotal: 0,
        shippingFee: 0,
        paymentMethod: PaymentMethod.COD,
        paymentStatus: PaymentStatus.PAID,
        orderStatus: OrderStatus.CONFIRMED,
      });

      const replacementItems = await setup.db
        .select({
          id: orderItems.id,
          quantity: orderItems.quantity,
          unitPrice: orderItems.unitPrice,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, body.data.replacementOrderId!));

      expect(replacementItems).toHaveLength(1);
      expect(replacementItems[0]?.quantity).toBe("3.00");
      expect(replacementItems[0]?.unitPrice).toBe(0);

      const allocations = await setup.db
        .select({
          batchId: batchAllocations.batchId,
          allocatedQuantity: batchAllocations.allocatedQuantity,
        })
        .from(batchAllocations)
        .where(eq(batchAllocations.orderItemId, replacementItems[0]!.id));

      expect(allocations).toHaveLength(2);
      expect(
        allocations.find((a) => a.batchId === earlierBatch.id)
          ?.allocatedQuantity,
      ).toBe("2.00");
      expect(
        allocations.find((a) => a.batchId === laterBatch.id)?.allocatedQuantity,
      ).toBe("1.00");

      const [updatedEarlier] = await setup.db
        .select({
          availableQuantity: batches.availableQuantity,
          status: batches.status,
        })
        .from(batches)
        .where(eq(batches.id, earlierBatch.id));
      expect(updatedEarlier).toEqual({
        availableQuantity: "0.00",
        status: BatchStatus.SOLD_OUT,
      });

      const [updatedLater] = await setup.db
        .select({
          availableQuantity: batches.availableQuantity,
          status: batches.status,
        })
        .from(batches)
        .where(eq(batches.id, laterBatch.id));
      expect(updatedLater).toEqual({
        availableQuantity: "4.00",
        status: BatchStatus.IN_STOCK,
      });
    });

    it("serializes concurrent resolution attempts on the same triaged complaint", async () => {
      // Invariant: INV-CMP-9, INV-CMP-10
      const { complaintId } = await seedTriagedComplaint({
        customerRewardPoints: 0,
      });
      const payload = {
        resolution: ComplaintResolution.REFUND,
        refundChannel: ComplaintRefundChannel.LOYALTY_POINTS,
        refundAmountVnd: 25_000,
      };

      const [resA, resB] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/complaints/${complaintId}/resolve`)
          .set(adminHeader)
          .set("Idempotency-Key", crypto.randomUUID())
          .send(payload),
        request(app.getHttpServer())
          .post(`/api/v1/complaints/${complaintId}/resolve`)
          .set(superAdminHeader)
          .set("Idempotency-Key", crypto.randomUUID())
          .send(payload),
      ]);

      const statuses = [resA.status, resB.status].sort((a, b) => a - b);
      expect(statuses).toEqual([200, 422]);

      const failed = resA.status === 422 ? resA : resB;
      expect((failed.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.COMPLAINT_INVALID_STATUS_TRANSITION,
      );

      const [updatedCustomer] = await setup.db
        .select({ rewardPoints: users.rewardPoints })
        .from(users)
        .where(eq(users.id, customerId));
      expect(updatedCustomer?.rewardPoints).toBe(25_000);
    });
  });
});
