import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import request from "supertest";
import { type INestApplication } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { eq, sql } from "drizzle-orm";
import {
  API_ERROR_CODES,
  BatchStatus,
  UserRole,
  WasteLogStatus,
} from "@greenroots/shared";
import { env } from "@/common/config/env.config";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import { IDEMPOTENCY_HEADER_NAME } from "@/common/constants/idempotency.constant";
import type { Rfc9457ProblemDetails } from "@/common/filters/global-exception.filter";
import type { ApiResponse } from "@/common/utils/api-response.util";
import { extractDatabaseErrorDetails } from "@/common/utils/error.util";
import { batches, users, wasteLogs } from "@/database/schemas";
import {
  BatchMother,
  createBatch,
  createProduct,
  createWasteLog,
  ProductMother,
  WasteLogMother,
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

type WasteLogSchema = components["schemas"]["WasteLogDto"];
type ProductSchema = components["schemas"]["ProductDto"];
type PaginationMetaSchema = components["schemas"]["PaginationMetaDto"];

const UNKNOWN_UUID_V7 = "019fa8bc-8f4d-7000-b366-e691f45cffff";

function wasteProofUrl(name = "proof-01.webp"): string {
  return `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/v1/waste_logs/${name}`;
}

describe("Waste Logs Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;
  let jwtService: JwtService;

  let customerHeader: { Authorization: string };
  let guestHeader: { Authorization: string };
  let salesHeader: { Authorization: string };
  let farmStaffId: string;
  let farmStaffHeader: { Authorization: string };
  let secondFarmStaffId: string;
  let secondFarmStaffHeader: { Authorization: string };
  let adminId: string;
  let adminHeader: { Authorization: string };
  let superAdminHeader: { Authorization: string };

  beforeAll(async () => {
    setup = await createTestApp();
    app = setup.app;
    jwtService = app.get(JwtService);
  }, 30000);

  beforeEach(async () => {
    await setup.db.execute(
      sql`TRUNCATE TABLE "waste_logs", "batches", "products", "categories", "farming_logs", "seasons", "plots", "farms", "users" CASCADE;`,
    );
    await cleanScopedRedisKeys(setup.redisClient);

    const [
      customerSession,
      guestSession,
      salesSession,
      farmStaffSession,
      secondFarmStaffSession,
      adminSession,
      superAdminSession,
    ] = await Promise.all([
      createAuthenticatedUser(setup.db, jwtService, {
        role: UserRole.CUSTOMER,
      }),
      createAuthenticatedUser(setup.db, jwtService, {
        role: UserRole.GUEST,
      }),
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.SALES),
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.FARM_STAFF),
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.FARM_STAFF),
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.ADMIN),
      createAuthenticatedAdmin(setup.db, jwtService, UserRole.SUPER_ADMIN),
    ]);

    customerHeader = customerSession.authHeader;
    guestHeader = guestSession.authHeader;
    salesHeader = salesSession.authHeader;
    farmStaffId = farmStaffSession.user.id;
    farmStaffHeader = farmStaffSession.authHeader;
    secondFarmStaffId = secondFarmStaffSession.user.id;
    secondFarmStaffHeader = secondFarmStaffSession.authHeader;
    adminId = adminSession.user.id;
    adminHeader = adminSession.authHeader;
    superAdminHeader = superAdminSession.authHeader;
  });

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  describe("POST /api/v1/waste-logs", () => {
    // Invariant: INV-WASTE-1
    it("creates a pending waste log without deducting batch or product stock", async () => {
      const product = await createProduct(setup.db);
      const batch = await createBatch(setup.db, {
        productId: product.id,
        initialQuantity: "10.00",
        availableQuantity: "10.00",
      });

      const res = await request(app.getHttpServer())
        .post("/api/v1/waste-logs")
        .set(farmStaffHeader)
        .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
        .send({
          batchId: batch.id,
          discardedQuantity: 2.5,
          reason: "Dập nát trong quá trình sơ chế",
          mediaUrls: [wasteProofUrl("tomato-01.webp")],
        });

      expect(res.status).toBe(201);
      const body = res.body as ApiResponse<WasteLogSchema>;
      expect(body.success).toBe(true);
      expect(body.data.status).toBe(WasteLogStatus.PENDING_APPROVAL);
      expect(body.data.discardedQuantity).toBe(2.5);
      expect(body.data.reviewer).toBeNull();
      expect(body.data.reviewedAt).toBeNull();
      expect(body.data.rejectionReason).toBeNull();
      expect(body.data.batch.availableQuantity).toBe(10);

      const productRes = await request(app.getHttpServer()).get(
        `/api/v1/products/${product.slug}`,
      );
      expect(productRes.status).toBe(200);
      expect(
        (productRes.body as ApiResponse<ProductSchema>).data.availableQuantity,
      ).toBe(10);
    });

    it("enforces Idempotency-Key header, identical replay, and payload mismatch rejection", async () => {
      const batch = await createBatch(setup.db, {
        initialQuantity: "10.00",
        availableQuantity: "10.00",
      });
      const idempotencyKey = randomUUID();
      const payload = {
        batchId: batch.id,
        discardedQuantity: 2,
        reason: "Hư hỏng kho lạnh",
        mediaUrls: [wasteProofUrl("replay-01.webp")],
      };

      const missingKeyRes = await request(app.getHttpServer())
        .post("/api/v1/waste-logs")
        .set(farmStaffHeader)
        .send(payload);
      expect(missingKeyRes.status).toBe(400);

      const first = await request(app.getHttpServer())
        .post("/api/v1/waste-logs")
        .set(farmStaffHeader)
        .set(IDEMPOTENCY_HEADER_NAME, idempotencyKey)
        .send(payload);
      expect(first.status).toBe(201);

      const replay = await request(app.getHttpServer())
        .post("/api/v1/waste-logs")
        .set(farmStaffHeader)
        .set(IDEMPOTENCY_HEADER_NAME, idempotencyKey)
        .send(payload);
      expect(replay.status).toBe(201);
      expect((replay.body as ApiResponse<WasteLogSchema>).data.id).toBe(
        (first.body as ApiResponse<WasteLogSchema>).data.id,
      );

      const mismatch = await request(app.getHttpServer())
        .post("/api/v1/waste-logs")
        .set(farmStaffHeader)
        .set(IDEMPOTENCY_HEADER_NAME, idempotencyKey)
        .send({ ...payload, discardedQuantity: 3 });
      expect(mismatch.status).toBe(422);

      const persisted = await setup.db
        .select()
        .from(wasteLogs)
        .where(eq(wasteLogs.batchId, batch.id));
      expect(persisted).toHaveLength(1);
    });

    it("allows admin proposal, expired batch, and soft-deleted product batch while returning not found for unknown batch", async () => {
      const deletedProduct = await createProduct(
        setup.db,
        ProductMother.softDeleted(),
      );
      const expiredBatch = await createBatch(
        setup.db,
        BatchMother.expired({
          productId: deletedProduct.id,
          initialQuantity: "8.00",
          availableQuantity: "6.00",
        }),
      );

      const [adminCreateRes, missingBatchRes] = await Promise.all([
        request(app.getHttpServer())
          .post("/api/v1/waste-logs")
          .set(adminHeader)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send({
            batchId: expiredBatch.id,
            discardedQuantity: 6,
            reason: "Tiêu hủy lô quá hạn sử dụng",
            mediaUrls: [wasteProofUrl("expired-01.webp")],
          }),
        request(app.getHttpServer())
          .post("/api/v1/waste-logs")
          .set(farmStaffHeader)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send({
            batchId: UNKNOWN_UUID_V7,
            discardedQuantity: 1,
            reason: "Lô không tồn tại",
            mediaUrls: [wasteProofUrl("missing-batch.webp")],
          }),
      ]);

      expect(adminCreateRes.status).toBe(201);
      expect(
        (adminCreateRes.body as ApiResponse<WasteLogSchema>).data.batch.status,
      ).toBe(BatchStatus.EXPIRED);
      expect(missingBatchRes.status).toBe(404);
      expect((missingBatchRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.BATCH_NOT_FOUND,
      );
    });

    it("rejects proposal for sold_out batch", async () => {
      const soldOutBatch = await createBatch(
        setup.db,
        BatchMother.soldOut({ initialQuantity: "5.00" }),
      );

      const res = await request(app.getHttpServer())
        .post("/api/v1/waste-logs")
        .set(farmStaffHeader)
        .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
        .send({
          batchId: soldOutBatch.id,
          discardedQuantity: 1,
          reason: "Không tồn kho",
          mediaUrls: [wasteProofUrl("sold-out.webp")],
        });

      expect(res.status).toBe(422);
      expect((res.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.WASTE_LOG_BATCH_NOT_ELIGIBLE,
      );
    });

    // Invariant: INV-WASTE-2
    it("serializes concurrent proposals and rejects over-proposal beyond remaining quota", async () => {
      const batch = await createBatch(setup.db, {
        initialQuantity: "10.00",
        availableQuantity: "10.00",
      });

      const [resA, resB] = await Promise.all([
        request(app.getHttpServer())
          .post("/api/v1/waste-logs")
          .set(farmStaffHeader)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send({
            batchId: batch.id,
            discardedQuantity: 6,
            reason: "Đề xuất 1",
            mediaUrls: [wasteProofUrl("race-1.webp")],
          }),
        request(app.getHttpServer())
          .post("/api/v1/waste-logs")
          .set(secondFarmStaffHeader)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send({
            batchId: batch.id,
            discardedQuantity: 6,
            reason: "Đề xuất 2",
            mediaUrls: [wasteProofUrl("race-2.webp")],
          }),
      ]);

      const statuses = [resA.status, resB.status].sort((a, b) => a - b);
      expect(statuses).toEqual([201, 422]);
      const rejected = resA.status === 422 ? resA : resB;
      expect((rejected.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.WASTE_LOG_QUANTITY_EXCEEDS_AVAILABLE,
      );
    });

    // Invariant: INV-WASTE-5
    it("rejects boundary quantity violations, unrecognized keys, and invalid mediaUrls", async () => {
      const batch = await createBatch(setup.db);
      const videoUrl = `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/video/upload/v1/waste_logs/clip.mp4`;
      const wrongFolderUrl = `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/v1/products/tomato.webp`;
      const transformUrl = `https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/image/upload/w_500,f_auto/v1/waste_logs/a.webp`;
      const dupUrl = wasteProofUrl("dup.webp");

      const [
        videoRes,
        folderRes,
        transformRes,
        dupRes,
        emptyMediaRes,
        tooManyMediaRes,
        zeroQtyRes,
        precisionQtyRes,
        unknownKeyRes,
      ] = await Promise.all([
        request(app.getHttpServer())
          .post("/api/v1/waste-logs")
          .set(farmStaffHeader)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send({
            batchId: batch.id,
            discardedQuantity: 1,
            reason: "Video bị cấm",
            mediaUrls: [videoUrl],
          }),
        request(app.getHttpServer())
          .post("/api/v1/waste-logs")
          .set(farmStaffHeader)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send({
            batchId: batch.id,
            discardedQuantity: 1,
            reason: "Sai folder",
            mediaUrls: [wrongFolderUrl],
          }),
        request(app.getHttpServer())
          .post("/api/v1/waste-logs")
          .set(farmStaffHeader)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send({
            batchId: batch.id,
            discardedQuantity: 1,
            reason: "Transform bị cấm",
            mediaUrls: [transformUrl],
          }),
        request(app.getHttpServer())
          .post("/api/v1/waste-logs")
          .set(farmStaffHeader)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send({
            batchId: batch.id,
            discardedQuantity: 1,
            reason: "Trùng URL",
            mediaUrls: [dupUrl, dupUrl],
          }),
        request(app.getHttpServer())
          .post("/api/v1/waste-logs")
          .set(farmStaffHeader)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send({
            batchId: batch.id,
            discardedQuantity: 1,
            reason: "Thiếu ảnh",
            mediaUrls: [],
          }),
        request(app.getHttpServer())
          .post("/api/v1/waste-logs")
          .set(farmStaffHeader)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send({
            batchId: batch.id,
            discardedQuantity: 1,
            reason: "Quá 3 ảnh",
            mediaUrls: [
              wasteProofUrl("1.webp"),
              wasteProofUrl("2.webp"),
              wasteProofUrl("3.webp"),
              wasteProofUrl("4.webp"),
            ],
          }),
        request(app.getHttpServer())
          .post("/api/v1/waste-logs")
          .set(farmStaffHeader)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send({
            batchId: batch.id,
            discardedQuantity: 0,
            reason: "Số lượng bằng 0",
            mediaUrls: [wasteProofUrl("zero-qty.webp")],
          }),
        request(app.getHttpServer())
          .post("/api/v1/waste-logs")
          .set(farmStaffHeader)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send({
            batchId: batch.id,
            discardedQuantity: 1.234,
            reason: "Quá 2 chữ số thập phân",
            mediaUrls: [wasteProofUrl("precision.webp")],
          }),
        request(app.getHttpServer())
          .post("/api/v1/waste-logs")
          .set(farmStaffHeader)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send({
            batchId: batch.id,
            discardedQuantity: 1,
            reason: "Dư trường lạ",
            mediaUrls: [wasteProofUrl("strict.webp")],
            extraField: true,
          }),
      ]);

      expect(videoRes.status).toBe(400);
      expect(folderRes.status).toBe(400);
      expect(transformRes.status).toBe(400);
      expect(dupRes.status).toBe(400);
      expect(emptyMediaRes.status).toBe(400);
      expect(tooManyMediaRes.status).toBe(400);
      expect(zeroQtyRes.status).toBe(400);
      expect(precisionQtyRes.status).toBe(400);
      expect(unknownKeyRes.status).toBe(400);
    });

    it("enforces role permissions and rejects unauthenticated, customer, guest, or sales callers", async () => {
      const batch = await createBatch(setup.db);
      const payload = {
        batchId: batch.id,
        discardedQuantity: 1,
        reason: "Kiểm tra quyền",
        mediaUrls: [wasteProofUrl("rbac.webp")],
      };

      const [unauthRes, customerRes, guestRes, salesRes] = await Promise.all([
        request(app.getHttpServer())
          .post("/api/v1/waste-logs")
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send(payload),
        request(app.getHttpServer())
          .post("/api/v1/waste-logs")
          .set(customerHeader)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send(payload),
        request(app.getHttpServer())
          .post("/api/v1/waste-logs")
          .set(guestHeader)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send(payload),
        request(app.getHttpServer())
          .post("/api/v1/waste-logs")
          .set(salesHeader)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send(payload),
      ]);

      expect(unauthRes.status).toBe(401);
      expect(customerRes.status).toBe(403);
      expect(guestRes.status).toBe(403);
      expect(salesRes.status).toBe(403);
    });
  });

  describe("GET /api/v1/waste-logs and GET /api/v1/waste-logs/:id", () => {
    it("scopes farm staff reads to own proposals while admins and super admins view, filter, and sort all logs", async () => {
      const productA = await createProduct(setup.db);
      const productB = await createProduct(setup.db);
      const batchA = await createBatch(setup.db, {
        productId: productA.id,
        batchCode: "BATCH-20261120-ALPHA-111111",
      });
      const batchB = await createBatch(setup.db, {
        productId: productB.id,
        batchCode: "BATCH-20261120-BETA%_222222",
      });

      const ownLog = await createWasteLog(setup.db, {
        batchId: batchA.id,
        reportedBy: farmStaffId,
        discardedQuantity: "2.00",
        status: WasteLogStatus.PENDING_APPROVAL,
      });
      const otherLog = await createWasteLog(
        setup.db,
        WasteLogMother.approved(adminId, {
          batchId: batchB.id,
          reportedBy: secondFarmStaffId,
          discardedQuantity: "5.00",
        }),
      );

      const staffListRes = await request(app.getHttpServer())
        .get("/api/v1/waste-logs")
        .set(farmStaffHeader);
      expect(staffListRes.status).toBe(200);
      const staffBody = staffListRes.body as ApiResponse<
        WasteLogSchema[],
        PaginationMetaSchema
      >;
      expect(staffBody.data.map((item) => item.id)).toEqual([ownLog.id]);
      expect(staffBody.meta?.total).toBe(1);

      const [
        forbiddenDetailRes,
        filteredRes,
        wildcardRes,
        sortedRes,
        unknownQueryRes,
      ] = await Promise.all([
        request(app.getHttpServer())
          .get(`/api/v1/waste-logs/${otherLog.id}`)
          .set(farmStaffHeader),
        request(app.getHttpServer())
          .get(
            `/api/v1/waste-logs?status=approved&productId=${productB.id}&batchId=${batchB.id}`,
          )
          .set(superAdminHeader),
        request(app.getHttpServer())
          .get("/api/v1/waste-logs?search=BETA%25_")
          .set(adminHeader),
        request(app.getHttpServer())
          .get("/api/v1/waste-logs?sort=discardedQuantity:desc&limit=1&page=1")
          .set(adminHeader),
        request(app.getHttpServer())
          .get("/api/v1/waste-logs?unknownParam=1")
          .set(adminHeader),
      ]);

      expect(forbiddenDetailRes.status).toBe(403);
      expect(filteredRes.status).toBe(200);
      expect(
        (filteredRes.body as ApiResponse<WasteLogSchema[]>).data.map(
          (item) => item.id,
        ),
      ).toEqual([otherLog.id]);
      expect(wildcardRes.status).toBe(200);
      expect(
        (wildcardRes.body as ApiResponse<WasteLogSchema[]>).data.map(
          (item) => item.id,
        ),
      ).toEqual([otherLog.id]);
      expect(sortedRes.status).toBe(200);
      const sortedBody = sortedRes.body as ApiResponse<
        WasteLogSchema[],
        PaginationMetaSchema
      >;
      expect(sortedBody.data.map((item) => item.id)).toEqual([otherLog.id]);
      expect(sortedBody.meta?.total).toBe(2);
      expect(sortedBody.meta?.hasNextPage).toBe(true);
      expect(unknownQueryRes.status).toBe(400);
    });

    it("rejects unauthorized and non-inventory roles on read endpoints", async () => {
      const log = await createWasteLog(setup.db, { reportedBy: farmStaffId });

      const [
        listUnauth,
        listCustomer,
        listSales,
        detailUnauth,
        detailCustomer,
        detailSales,
        invalidIdRes,
      ] = await Promise.all([
        request(app.getHttpServer()).get("/api/v1/waste-logs"),
        request(app.getHttpServer())
          .get("/api/v1/waste-logs")
          .set(customerHeader),
        request(app.getHttpServer()).get("/api/v1/waste-logs").set(salesHeader),
        request(app.getHttpServer()).get(`/api/v1/waste-logs/${log.id}`),
        request(app.getHttpServer())
          .get(`/api/v1/waste-logs/${log.id}`)
          .set(customerHeader),
        request(app.getHttpServer())
          .get(`/api/v1/waste-logs/${log.id}`)
          .set(salesHeader),
        request(app.getHttpServer())
          .get("/api/v1/waste-logs/not-a-uuid")
          .set(adminHeader),
      ]);

      expect(listUnauth.status).toBe(401);
      expect(listCustomer.status).toBe(403);
      expect(listSales.status).toBe(403);
      expect(detailUnauth.status).toBe(401);
      expect(detailCustomer.status).toBe(403);
      expect(detailSales.status).toBe(403);
      expect(invalidIdRes.status).toBe(400);
    });
  });

  describe("POST /api/v1/waste-logs/:id/approve", () => {
    // Invariant: INV-WASTE-2
    it("atomically deducts available quantity and transitions depleted in_stock and near_expiry batches to sold_out", async () => {
      for (const batchPreset of [
        BatchMother.inStock({
          initialQuantity: "5.00",
          availableQuantity: "5.00",
        }),
        BatchMother.nearExpiry({
          initialQuantity: "3.00",
          availableQuantity: "3.00",
        }),
      ]) {
        const product = await createProduct(setup.db);
        const batch = await createBatch(setup.db, {
          ...batchPreset,
          productId: product.id,
        });
        const log = await createWasteLog(
          setup.db,
          WasteLogMother.pendingApproval({
            batchId: batch.id,
            reportedBy: farmStaffId,
            discardedQuantity: String(batch.availableQuantity),
          }),
        );

        const res = await request(app.getHttpServer())
          .post(`/api/v1/waste-logs/${log.id}/approve`)
          .set(adminHeader)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID());

        expect(res.status).toBe(200);
        const body = res.body as ApiResponse<WasteLogSchema>;
        expect(body.data.status).toBe(WasteLogStatus.APPROVED);
        expect(body.data.reviewer?.id).toBe(adminId);
        expect(body.data.reviewedAt).not.toBeNull();
        expect(body.data.batch.availableQuantity).toBe(0);
        expect(body.data.batch.status).toBe(BatchStatus.SOLD_OUT);

        const [persistedBatch] = await setup.db
          .select()
          .from(batches)
          .where(eq(batches.id, batch.id));
        expect(persistedBatch?.availableQuantity).toBe("0.00");
        expect(persistedBatch?.status).toBe(BatchStatus.SOLD_OUT);

        const productRes = await request(app.getHttpServer()).get(
          `/api/v1/products/${product.slug}`,
        );
        expect(
          (productRes.body as ApiResponse<ProductSchema>).data
            .availableQuantity,
        ).toBe(0);
      }
    });

    it("keeps expired batch status unchanged when approved write-off empties remaining stock", async () => {
      const expiredBatch = await createBatch(
        setup.db,
        BatchMother.expired({
          initialQuantity: "4.00",
          availableQuantity: "4.00",
        }),
      );
      const log = await createWasteLog(setup.db, {
        batchId: expiredBatch.id,
        reportedBy: farmStaffId,
        discardedQuantity: "4.00",
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/waste-logs/${log.id}/approve`)
        .set(superAdminHeader)
        .set(IDEMPOTENCY_HEADER_NAME, randomUUID());

      expect(res.status).toBe(200);
      expect((res.body as ApiResponse<WasteLogSchema>).data.batch.status).toBe(
        BatchStatus.EXPIRED,
      );
    });

    it("replays identical idempotent approval without double-deducting stock and rejects unexpected body keys", async () => {
      const batch = await createBatch(setup.db, {
        initialQuantity: "10.00",
        availableQuantity: "10.00",
      });
      const log = await createWasteLog(setup.db, {
        batchId: batch.id,
        reportedBy: farmStaffId,
        discardedQuantity: "2.00",
      });

      const unexpectedBodyRes = await request(app.getHttpServer())
        .post(`/api/v1/waste-logs/${log.id}/approve`)
        .set(adminHeader)
        .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
        .send({ unexpected: true });
      expect(unexpectedBodyRes.status).toBe(400);

      const idempotencyKey = randomUUID();
      const first = await request(app.getHttpServer())
        .post(`/api/v1/waste-logs/${log.id}/approve`)
        .set(adminHeader)
        .set(IDEMPOTENCY_HEADER_NAME, idempotencyKey);
      expect(first.status).toBe(200);

      const replay = await request(app.getHttpServer())
        .post(`/api/v1/waste-logs/${log.id}/approve`)
        .set(adminHeader)
        .set(IDEMPOTENCY_HEADER_NAME, idempotencyKey);
      expect(replay.status).toBe(200);
      expect(
        (replay.body as ApiResponse<WasteLogSchema>).data.batch
          .availableQuantity,
      ).toBe(8);

      const [persistedBatch] = await setup.db
        .select()
        .from(batches)
        .where(eq(batches.id, batch.id));
      expect(persistedBatch?.availableQuantity).toBe("8.00");
    });

    // Invariant: INV-WASTE-3
    it("enforces RBAC and forbids self-approval across unauthenticated, customer, sales, farm staff, and reporter admins", async () => {
      const adminSelfLog = await createWasteLog(setup.db, {
        reportedBy: adminId,
        discardedQuantity: "1.00",
      });

      const [unauthRes, customerRes, salesRes, staffRes, selfAttempt] =
        await Promise.all([
          request(app.getHttpServer())
            .post(`/api/v1/waste-logs/${adminSelfLog.id}/approve`)
            .set(IDEMPOTENCY_HEADER_NAME, randomUUID()),
          request(app.getHttpServer())
            .post(`/api/v1/waste-logs/${adminSelfLog.id}/approve`)
            .set(customerHeader)
            .set(IDEMPOTENCY_HEADER_NAME, randomUUID()),
          request(app.getHttpServer())
            .post(`/api/v1/waste-logs/${adminSelfLog.id}/approve`)
            .set(salesHeader)
            .set(IDEMPOTENCY_HEADER_NAME, randomUUID()),
          request(app.getHttpServer())
            .post(`/api/v1/waste-logs/${adminSelfLog.id}/approve`)
            .set(farmStaffHeader)
            .set(IDEMPOTENCY_HEADER_NAME, randomUUID()),
          request(app.getHttpServer())
            .post(`/api/v1/waste-logs/${adminSelfLog.id}/approve`)
            .set(adminHeader)
            .set(IDEMPOTENCY_HEADER_NAME, randomUUID()),
        ]);

      expect(unauthRes.status).toBe(401);
      expect(customerRes.status).toBe(403);
      expect(salesRes.status).toBe(403);
      expect(staffRes.status).toBe(403);
      expect(selfAttempt.status).toBe(403);
      expect((selfAttempt.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.WASTE_LOG_SELF_REVIEW_FORBIDDEN,
      );
    });

    // Invariant: INV-WASTE-2
    it("returns conflict and keeps log pending when available quantity dropped below proposal", async () => {
      const batch = await createBatch(setup.db, {
        initialQuantity: "10.00",
        availableQuantity: "3.00",
      });
      const log = await createWasteLog(setup.db, {
        batchId: batch.id,
        reportedBy: farmStaffId,
        discardedQuantity: "5.00",
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/waste-logs/${log.id}/approve`)
        .set(adminHeader)
        .set(IDEMPOTENCY_HEADER_NAME, randomUUID());

      expect(res.status).toBe(409);
      expect((res.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.INSUFFICIENT_STOCK,
      );

      const [persistedLog] = await setup.db
        .select()
        .from(wasteLogs)
        .where(eq(wasteLogs.id, log.id));
      expect(persistedLog?.status).toBe(WasteLogStatus.PENDING_APPROVAL);
    });

    // Invariant: INV-WASTE-4
    it("serializes concurrent approve vs approve and approve vs reject calls so only one reviewer transitions the log", async () => {
      const batch = await createBatch(setup.db, {
        initialQuantity: "20.00",
        availableQuantity: "20.00",
      });
      const logA = await createWasteLog(setup.db, {
        batchId: batch.id,
        reportedBy: farmStaffId,
        discardedQuantity: "3.00",
      });
      const logB = await createWasteLog(setup.db, {
        batchId: batch.id,
        reportedBy: farmStaffId,
        discardedQuantity: "4.00",
      });

      const [approveOne, approveTwo, approveThree, rejectThree] =
        await Promise.all([
          request(app.getHttpServer())
            .post(`/api/v1/waste-logs/${logA.id}/approve`)
            .set(adminHeader)
            .set(IDEMPOTENCY_HEADER_NAME, randomUUID()),
          request(app.getHttpServer())
            .post(`/api/v1/waste-logs/${logA.id}/approve`)
            .set(superAdminHeader)
            .set(IDEMPOTENCY_HEADER_NAME, randomUUID()),
          request(app.getHttpServer())
            .post(`/api/v1/waste-logs/${logB.id}/approve`)
            .set(adminHeader)
            .set(IDEMPOTENCY_HEADER_NAME, randomUUID()),
          request(app.getHttpServer())
            .post(`/api/v1/waste-logs/${logB.id}/reject`)
            .set(superAdminHeader)
            .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
            .send({ rejectionReason: "Cân lại khối lượng" }),
        ]);

      const approveRaceStatuses = [approveOne.status, approveTwo.status].sort(
        (a, b) => a - b,
      );
      expect(approveRaceStatuses).toEqual([200, 409]);
      const approveLoser = approveOne.status === 409 ? approveOne : approveTwo;
      expect((approveLoser.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.WASTE_LOG_ALREADY_REVIEWED,
      );

      const mixedRaceStatuses = [approveThree.status, rejectThree.status].sort(
        (a, b) => a - b,
      );
      expect(mixedRaceStatuses).toEqual([200, 409]);
      const mixedLoser =
        approveThree.status === 409 ? approveThree : rejectThree;
      expect((mixedLoser.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.WASTE_LOG_ALREADY_REVIEWED,
      );
    });

    it("returns not found for nonexistent waste log ID", async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/waste-logs/${UNKNOWN_UUID_V7}/approve`)
        .set(adminHeader)
        .set(IDEMPOTENCY_HEADER_NAME, randomUUID());

      expect(res.status).toBe(404);
      expect((res.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.WASTE_LOG_NOT_FOUND,
      );
    });
  });

  describe("POST /api/v1/waste-logs/:id/reject", () => {
    // Invariant: INV-WASTE-4
    it("rejects pending proposal with idempotency support and locks terminal state against re-review", async () => {
      const batch = await createBatch(setup.db, {
        initialQuantity: "10.00",
        availableQuantity: "10.00",
      });
      const log = await createWasteLog(setup.db, {
        batchId: batch.id,
        reportedBy: farmStaffId,
        discardedQuantity: "2.00",
      });

      const idempotencyKey = randomUUID();
      const rejectPayload = {
        rejectionReason: "Ảnh chụp cân không rõ vạch số kg",
      };

      const res = await request(app.getHttpServer())
        .post(`/api/v1/waste-logs/${log.id}/reject`)
        .set(adminHeader)
        .set(IDEMPOTENCY_HEADER_NAME, idempotencyKey)
        .send(rejectPayload);

      expect(res.status).toBe(200);
      const body = res.body as ApiResponse<WasteLogSchema>;
      expect(body.data.status).toBe(WasteLogStatus.REJECTED);
      expect(body.data.rejectionReason).toBe(rejectPayload.rejectionReason);
      expect(body.data.reviewer?.id).toBe(adminId);
      expect(body.data.batch.availableQuantity).toBe(10);

      const [replayRes, mismatchRes, secondReview] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/waste-logs/${log.id}/reject`)
          .set(adminHeader)
          .set(IDEMPOTENCY_HEADER_NAME, idempotencyKey)
          .send(rejectPayload),
        request(app.getHttpServer())
          .post(`/api/v1/waste-logs/${log.id}/reject`)
          .set(adminHeader)
          .set(IDEMPOTENCY_HEADER_NAME, idempotencyKey)
          .send({ rejectionReason: "Lý do khác" }),
        request(app.getHttpServer())
          .post(`/api/v1/waste-logs/${log.id}/approve`)
          .set(superAdminHeader)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID()),
      ]);

      expect(replayRes.status).toBe(200);
      expect(mismatchRes.status).toBe(422);
      expect(secondReview.status).toBe(409);
      expect((secondReview.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.WASTE_LOG_ALREADY_REVIEWED,
      );
    });

    it("enforces RBAC, self-rejection guard, not-found, and validation boundaries on reject", async () => {
      const staffLog = await createWasteLog(setup.db, {
        reportedBy: farmStaffId,
      });
      const adminSelfLog = await createWasteLog(setup.db, {
        reportedBy: adminId,
      });

      const [
        emptyReasonRes,
        unauthRes,
        customerRes,
        staffRes,
        selfRejectRes,
        missingLogRes,
      ] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/waste-logs/${staffLog.id}/reject`)
          .set(adminHeader)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send({ rejectionReason: "   " }),
        request(app.getHttpServer())
          .post(`/api/v1/waste-logs/${staffLog.id}/reject`)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send({ rejectionReason: "Thiếu đăng nhập" }),
        request(app.getHttpServer())
          .post(`/api/v1/waste-logs/${staffLog.id}/reject`)
          .set(customerHeader)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send({ rejectionReason: "Không đủ quyền" }),
        request(app.getHttpServer())
          .post(`/api/v1/waste-logs/${staffLog.id}/reject`)
          .set(farmStaffHeader)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send({ rejectionReason: "Không đủ quyền" }),
        request(app.getHttpServer())
          .post(`/api/v1/waste-logs/${adminSelfLog.id}/reject`)
          .set(adminHeader)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send({ rejectionReason: "Tự từ chối" }),
        request(app.getHttpServer())
          .post(`/api/v1/waste-logs/${UNKNOWN_UUID_V7}/reject`)
          .set(adminHeader)
          .set(IDEMPOTENCY_HEADER_NAME, randomUUID())
          .send({ rejectionReason: "Không tồn tại" }),
      ]);

      expect(emptyReasonRes.status).toBe(400);
      expect(unauthRes.status).toBe(401);
      expect(customerRes.status).toBe(403);
      expect(staffRes.status).toBe(403);
      expect(selfRejectRes.status).toBe(403);
      expect((selfRejectRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.WASTE_LOG_SELF_REVIEW_FORBIDDEN,
      );
      expect(missingLogRes.status).toBe(404);
      expect((missingLogRes.body as Rfc9457ProblemDetails).code).toBe(
        API_ERROR_CODES.WASTE_LOG_NOT_FOUND,
      );
    });

    it("sets reviewer to null cleanly when reviewer user is deleted", async () => {
      const batch = await createBatch(setup.db);
      const reviewer = await createAuthenticatedAdmin(
        setup.db,
        jwtService,
        UserRole.ADMIN,
      );
      const log = await createWasteLog(
        setup.db,
        WasteLogMother.rejected(reviewer.user.id, {
          batchId: batch.id,
          reportedBy: farmStaffId,
        }),
      );

      await setup.db.delete(users).where(eq(users.id, reviewer.user.id));

      const res = await request(app.getHttpServer())
        .get(`/api/v1/waste-logs/${log.id}`)
        .set(adminHeader);

      expect(res.status).toBe(200);
      const body = res.body as ApiResponse<WasteLogSchema>;
      expect(body.data.reviewer).toBeNull();
      expect(body.data.status).toBe(WasteLogStatus.REJECTED);
    });
  });

  describe("Database CHECK Constraints", () => {
    it("enforces positive discarded_quantity and review state consistency checks", async () => {
      const batch = await createBatch(setup.db);

      let nonPositiveError: unknown;
      try {
        await setup.db.insert(wasteLogs).values({
          batchId: batch.id,
          reportedBy: farmStaffId,
          discardedQuantity: "0.00",
          reason: "Invalid zero",
          mediaUrls: [wasteProofUrl("zero.webp")],
          status: WasteLogStatus.PENDING_APPROVAL,
        });
      } catch (err) {
        nonPositiveError = err;
      }
      expect(extractDatabaseErrorDetails(nonPositiveError).code).toBe(
        PG_ERROR_CODE.CHECK_VIOLATION,
      );

      let inconsistentReviewError: unknown;
      try {
        await setup.db.insert(wasteLogs).values({
          batchId: batch.id,
          reportedBy: farmStaffId,
          discardedQuantity: "1.00",
          reason: "Pending with reviewer",
          mediaUrls: [wasteProofUrl("inconsistent-pending.webp")],
          status: WasteLogStatus.PENDING_APPROVAL,
          reviewedBy: adminId,
        });
      } catch (err) {
        inconsistentReviewError = err;
      }
      expect(extractDatabaseErrorDetails(inconsistentReviewError).code).toBe(
        PG_ERROR_CODE.CHECK_VIOLATION,
      );

      let blankRejectReasonError: unknown;
      try {
        await setup.db.insert(wasteLogs).values({
          batchId: batch.id,
          reportedBy: farmStaffId,
          discardedQuantity: "1.00",
          reason: "Rejected with blank reason",
          mediaUrls: [wasteProofUrl("inconsistent-reject.webp")],
          status: WasteLogStatus.REJECTED,
          reviewedAt: new Date(),
          rejectionReason: "   ",
        });
      } catch (err) {
        blankRejectReasonError = err;
      }
      expect(extractDatabaseErrorDetails(blankRejectReasonError).code).toBe(
        PG_ERROR_CODE.CHECK_VIOLATION,
      );
    });
  });
});
