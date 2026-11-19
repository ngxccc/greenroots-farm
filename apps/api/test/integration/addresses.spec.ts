import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "bun:test";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import type { Server } from "node:http";
import { JwtService } from "@nestjs/jwt";
import { and, eq } from "drizzle-orm";
import {
  API_ERROR_CODES,
  BUSINESS_RULES,
  DeliveryDay,
  HCMC_DISTRICTS,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  SubscriptionStatus,
  UserRole,
} from "@greenroots/shared";
import type { DrizzleDB } from "@/database/database.module";
import {
  orders,
  subscriptions,
  userAddresses,
  users,
} from "@/database/schemas";
import { truncateAllTables } from "@/database/utils/truncate.util";
import type { components } from "../generated/api-schema";
import {
  cleanScopedRedisKeys,
  createTestApp,
  teardownTestApp,
  type TestAppSetup,
} from "../helpers/app.helper";
import { createAuthenticatedUser } from "../helpers/auth.helper";

type ApiResponseEnvelope<T> = components["schemas"]["ApiResponseDto"] & {
  data: T;
};
type AddressResponse = components["schemas"]["AddressDto"];
type CreateAddressPayload = components["schemas"]["CreateAddressDto"];
type Rfc9457Error = components["schemas"]["Rfc9457ErrorResponseDto"];

const CONTRACT_ADDRESS_KEYS = [
  "id",
  "receiverName",
  "phoneNumber",
  "streetAddress",
  "districtCode",
  "district",
  "city",
  "isDefault",
  "createdAt",
  "updatedAt",
] as const;

const QUAN_7 = HCMC_DISTRICTS.find((d) => d.code === "quan-7")!;
const THU_DUC = HCMC_DISTRICTS.find((d) => d.code === "thu-duc")!;
const QUAN_1 = HCMC_DISTRICTS.find((d) => d.code === "quan-1")!;
const UUID_V4 = "550e8400-e29b-41d4-a716-446655440000";

function buildAddressPayload(
  overrides: Partial<CreateAddressPayload> = {},
): CreateAddressPayload {
  return {
    receiverName: "Nguyen Van An",
    phoneNumber: "0912345678",
    streetAddress: "12 Nguyen Van Linh",
    districtCode: QUAN_7.code,
    ...overrides,
  };
}

describe("Addresses Integration", () => {
  let setup: TestAppSetup;
  let app: INestApplication;
  let db: DrizzleDB;
  let jwtService: JwtService;

  const getHttpServer = (): Server => app.getHttpServer() as Server;

  const createAddressViaApi = async (
    authHeader: { Authorization: string },
    overrides: Partial<CreateAddressPayload> = {},
  ): Promise<AddressResponse> => {
    const res = await request(getHttpServer())
      .post("/api/v1/users/me/addresses")
      .set(authHeader)
      .send(buildAddressPayload(overrides))
      .expect(201);

    return (res.body as ApiResponseEnvelope<AddressResponse>).data;
  };

  beforeAll(async () => {
    setup = await createTestApp();
    app = setup.app;
    db = setup.db;
    jwtService = app.get(JwtService);
    expect(setup.dbContext.isLiveDb).toBe(true);
  }, 30000);

  afterAll(async () => {
    await teardownTestApp(setup);
  });

  beforeEach(async () => {
    await truncateAllTables(db, setup.workerSchema);
    await cleanScopedRedisKeys(setup.redisClient);
  }, 15000);

  describe("GET /api/v1/users/me/addresses", () => {
    it("rejects unauthenticated callers", async () => {
      const res = await request(getHttpServer())
        .get("/api/v1/users/me/addresses")
        .expect(401);

      expect((res.body as Rfc9457Error).status).toBe(401);
    });

    it("forbids non-customer roles from accessing address book endpoints", async () => {
      const owner = await createAuthenticatedUser(db, jwtService);
      const created = await createAddressViaApi(owner.authHeader);

      const nonCustomerRoles = [
        UserRole.GUEST,
        UserRole.FARM_STAFF,
        UserRole.SALES,
        UserRole.ADMIN,
        UserRole.SUPER_ADMIN,
      ] as const;

      for (const role of nonCustomerRoles) {
        const { authHeader } = await createAuthenticatedUser(db, jwtService, {
          role,
        });

        const responses = await Promise.all([
          request(getHttpServer())
            .get("/api/v1/users/me/addresses")
            .set(authHeader),
          request(getHttpServer())
            .post("/api/v1/users/me/addresses")
            .set(authHeader)
            .send(buildAddressPayload()),
          request(getHttpServer())
            .patch(`/api/v1/users/me/addresses/${created.id}`)
            .set(authHeader)
            .send({ receiverName: "Blocked" }),
          request(getHttpServer())
            .patch(`/api/v1/users/me/addresses/${created.id}/default`)
            .set(authHeader),
          request(getHttpServer())
            .delete(`/api/v1/users/me/addresses/${created.id}`)
            .set(authHeader),
        ]);

        for (const res of responses) {
          expect(res.status).toBe(403);
          expect((res.body as Rfc9457Error).code).toBe(
            API_ERROR_CODES.FORBIDDEN,
          );
        }
      }
    });

    it("returns an empty array when the caller has no saved addresses", async () => {
      const { authHeader } = await createAuthenticatedUser(db, jwtService);

      const res = await request(getHttpServer())
        .get("/api/v1/users/me/addresses")
        .set(authHeader)
        .expect(200);

      const envelope = res.body as ApiResponseEnvelope<AddressResponse[]>;
      expect(envelope.success).toBe(true);
      expect(envelope.data).toEqual([]);
    });

    // Invariant: INV-ADDR-7
    it("rejects callers whose account is soft-deleted across all address endpoints", async () => {
      const { user, authHeader } = await createAuthenticatedUser(
        db,
        jwtService,
      );
      const created = await createAddressViaApi(authHeader);

      await db
        .update(users)
        .set({ deletedAt: new Date() })
        .where(eq(users.id, user.id));

      const responses = await Promise.all([
        request(getHttpServer())
          .get("/api/v1/users/me/addresses")
          .set(authHeader),
        request(getHttpServer())
          .post("/api/v1/users/me/addresses")
          .set(authHeader)
          .send(buildAddressPayload()),
        request(getHttpServer())
          .patch(`/api/v1/users/me/addresses/${created.id}`)
          .set(authHeader)
          .send({ receiverName: "Updated" }),
        request(getHttpServer())
          .patch(`/api/v1/users/me/addresses/${created.id}/default`)
          .set(authHeader),
        request(getHttpServer())
          .delete(`/api/v1/users/me/addresses/${created.id}`)
          .set(authHeader),
      ]);

      for (const res of responses) {
        expect(res.status).toBe(401);
        expect((res.body as Rfc9457Error).code).toBe(
          API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
        );
      }
    });

    // Invariant: INV-ADDR-4, INV-ADDR-8
    it("returns only the caller addresses ordered with default first and without coordinate fields", async () => {
      const owner = await createAuthenticatedUser(db, jwtService);
      const other = await createAuthenticatedUser(db, jwtService);

      await createAddressViaApi(other.authHeader, {
        receiverName: "Other User",
      });
      const first = await createAddressViaApi(owner.authHeader, {
        receiverName: "First Address",
      });
      const second = await createAddressViaApi(owner.authHeader, {
        receiverName: "Second Default",
        districtCode: THU_DUC.code,
        isDefault: true,
      });

      const listRes = await request(getHttpServer())
        .get("/api/v1/users/me/addresses")
        .set(owner.authHeader)
        .expect(200);

      const envelope = listRes.body as ApiResponseEnvelope<AddressResponse[]>;
      expect(envelope.success).toBe(true);
      expect(envelope.data).toHaveLength(2);
      expect(envelope.data[0]?.id).toBe(second.id);
      expect(envelope.data[0]?.isDefault).toBe(true);
      expect(envelope.data[1]?.id).toBe(first.id);
      expect(envelope.data[1]?.isDefault).toBe(false);

      for (const item of envelope.data) {
        expect(Object.keys(item).sort()).toEqual(
          [...CONTRACT_ADDRESS_KEYS].sort(),
        );
        expect(item).not.toHaveProperty("latitude");
        expect(item).not.toHaveProperty("longitude");
        expect(item).not.toHaveProperty("userId");
      }
    });
  });

  describe("POST /api/v1/users/me/addresses", () => {
    // Invariant: INV-ADDR-1, INV-ADDR-2, INV-ADDR-8
    it("creates the first address as default with server-derived district centroid", async () => {
      const { user, authHeader } = await createAuthenticatedUser(
        db,
        jwtService,
      );

      const data = await createAddressViaApi(authHeader, {
        receiverName: "  <b>Tran</b>   Thi   Binh  ",
        streetAddress: " 45  <i>Le Van Luong</i> ",
        isDefault: false,
      });

      expect(Object.keys(data).sort()).toEqual(
        [...CONTRACT_ADDRESS_KEYS].sort(),
      );
      expect(data.receiverName).toBe("Tran Thi Binh");
      expect(data.streetAddress).toBe("45 Le Van Luong");
      expect(data.districtCode).toBe(QUAN_7.code);
      expect(data.district).toBe(QUAN_7.name);
      expect(data.city).toBe(BUSINESS_RULES.DEFAULT_DELIVERY_CITY);
      expect(data.isDefault).toBe(true);

      const [persisted] = await db
        .select()
        .from(userAddresses)
        .where(
          and(eq(userAddresses.id, data.id), eq(userAddresses.userId, user.id)),
        )
        .limit(1);

      expect(persisted?.latitude).toBe(QUAN_7.latitude.toFixed(8));
      expect(persisted?.longitude).toBe(QUAN_7.longitude.toFixed(8));
    });

    // Invariant: INV-ADDR-1
    it("rejects client-supplied latitude, longitude, city, userId, and unknown fields", async () => {
      const { authHeader } = await createAuthenticatedUser(db, jwtService);

      const invalidPayloads = [
        { ...buildAddressPayload(), latitude: 10.7769 },
        { ...buildAddressPayload(), longitude: 106.7009 },
        { ...buildAddressPayload(), city: "TP. Hồ Chí Minh" },
        { ...buildAddressPayload(), userId: UUID_V4 },
        { ...buildAddressPayload(), extraField: "ignored" },
      ];

      for (const payload of invalidPayloads) {
        const res = await request(getHttpServer())
          .post("/api/v1/users/me/addresses")
          .set(authHeader)
          .send(payload)
          .expect(400);

        const body = res.body as Rfc9457Error;
        expect(body.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
        expect(
          body.invalidParams?.some(
            (param) => param.code === API_ERROR_CODES.UNRECOGNIZED_KEYS,
          ),
        ).toBe(true);
      }
    });

    // Invariant: INV-ADDR-1
    it("rejects unknown districtCode values with unprocessable entity error", async () => {
      const { authHeader } = await createAuthenticatedUser(db, jwtService);

      const res = await request(getHttpServer())
        .post("/api/v1/users/me/addresses")
        .set(authHeader)
        .send(buildAddressPayload({ districtCode: "quan-99" }))
        .expect(422);

      expect((res.body as Rfc9457Error).code).toBe(
        API_ERROR_CODES.DISTRICT_CODE_INVALID,
      );
    });

    it("rejects whitespace-only districtCode with required validation code", async () => {
      const { authHeader } = await createAuthenticatedUser(db, jwtService);

      const res = await request(getHttpServer())
        .post("/api/v1/users/me/addresses")
        .set(authHeader)
        .send(buildAddressPayload({ districtCode: "   " }))
        .expect(400);

      const body = res.body as Rfc9457Error;
      expect(body.code).toBe(API_ERROR_CODES.VALIDATION_FAILED);
      expect(body.invalidParams?.[0]?.name).toBe("districtCode");
      expect(body.invalidParams?.[0]?.code).toBe(API_ERROR_CODES.REQUIRED);
    });

    // Invariant: INV-ADDR-3
    it("rejects an eleventh address without inserting a row", async () => {
      const { user, authHeader } = await createAuthenticatedUser(
        db,
        jwtService,
      );

      for (let i = 0; i < BUSINESS_RULES.MAX_USER_ADDRESSES; i += 1) {
        await createAddressViaApi(authHeader, {
          receiverName: `Address ${i + 1}`,
        });
      }

      const res = await request(getHttpServer())
        .post("/api/v1/users/me/addresses")
        .set(authHeader)
        .send(buildAddressPayload({ receiverName: "Address 11" }))
        .expect(422);

      expect((res.body as Rfc9457Error).code).toBe(
        API_ERROR_CODES.ADDRESS_LIMIT_REACHED,
      );

      const rows = await db
        .select({ id: userAddresses.id })
        .from(userAddresses)
        .where(eq(userAddresses.userId, user.id));
      expect(rows).toHaveLength(BUSINESS_RULES.MAX_USER_ADDRESSES);
    });

    // Invariant: INV-ADDR-2
    it("creates two concurrent first addresses cleanly with exactly one default", async () => {
      const { user, authHeader } = await createAuthenticatedUser(
        db,
        jwtService,
      );

      const [resA, resB] = await Promise.all([
        request(getHttpServer())
          .post("/api/v1/users/me/addresses")
          .set(authHeader)
          .send(buildAddressPayload({ receiverName: "First A" })),
        request(getHttpServer())
          .post("/api/v1/users/me/addresses")
          .set(authHeader)
          .send(buildAddressPayload({ receiverName: "First B" })),
      ]);

      expect(resA.status).toBe(201);
      expect(resB.status).toBe(201);

      const rows = await db
        .select()
        .from(userAddresses)
        .where(eq(userAddresses.userId, user.id));
      expect(rows).toHaveLength(2);
      expect(rows.filter((r) => r.isDefault)).toHaveLength(1);
    });

    // Invariant: INV-ADDR-3
    it("enforces the 10-address cap when two concurrent creates race at nine addresses", async () => {
      const { user, authHeader } = await createAuthenticatedUser(
        db,
        jwtService,
      );

      for (let i = 0; i < BUSINESS_RULES.MAX_USER_ADDRESSES - 1; i += 1) {
        await createAddressViaApi(authHeader, {
          receiverName: `Address ${i + 1}`,
        });
      }

      const [resA, resB] = await Promise.all([
        request(getHttpServer())
          .post("/api/v1/users/me/addresses")
          .set(authHeader)
          .send(buildAddressPayload({ receiverName: "Race 10A" })),
        request(getHttpServer())
          .post("/api/v1/users/me/addresses")
          .set(authHeader)
          .send(buildAddressPayload({ receiverName: "Race 10B" })),
      ]);

      const statuses = [resA.status, resB.status].sort((a, b) => a - b);
      expect(statuses).toEqual([201, 422]);

      const rows = await db
        .select({ id: userAddresses.id })
        .from(userAddresses)
        .where(eq(userAddresses.userId, user.id));
      expect(rows).toHaveLength(BUSINESS_RULES.MAX_USER_ADDRESSES);
    });
  });

  describe("PATCH /api/v1/users/me/addresses/:id", () => {
    // Invariant: INV-ADDR-6
    it("updates fields and recomputes district and centroid coordinates on district change", async () => {
      const { user, authHeader } = await createAuthenticatedUser(
        db,
        jwtService,
      );
      const created = await createAddressViaApi(authHeader);

      const updated = await request(getHttpServer())
        .patch(`/api/v1/users/me/addresses/${created.id}`)
        .set(authHeader)
        .send({
          receiverName: "Le Van Cuong",
          districtCode: THU_DUC.code,
        })
        .expect(200);

      const { data } = updated.body as ApiResponseEnvelope<AddressResponse>;
      expect(data.receiverName).toBe("Le Van Cuong");
      expect(data.districtCode).toBe(THU_DUC.code);
      expect(data.district).toBe(THU_DUC.name);
      expect(data.city).toBe(BUSINESS_RULES.DEFAULT_DELIVERY_CITY);

      const [persisted] = await db
        .select()
        .from(userAddresses)
        .where(
          and(
            eq(userAddresses.id, created.id),
            eq(userAddresses.userId, user.id),
          ),
        )
        .limit(1);
      expect(persisted?.latitude).toBe(THU_DUC.latitude.toFixed(8));
      expect(persisted?.longitude).toBe(THU_DUC.longitude.toFixed(8));
    });

    // Invariant: INV-ADDR-1
    it("rejects unknown districtCode values when updating an address", async () => {
      const { authHeader } = await createAuthenticatedUser(db, jwtService);
      const created = await createAddressViaApi(authHeader);

      const res = await request(getHttpServer())
        .patch(`/api/v1/users/me/addresses/${created.id}`)
        .set(authHeader)
        .send({ districtCode: "quan-99" })
        .expect(422);

      expect((res.body as Rfc9457Error).code).toBe(
        API_ERROR_CODES.DISTRICT_CODE_INVALID,
      );
    });

    it("rejects empty bodies, protected fields, and malformed or UUIDv4 ids", async () => {
      const { authHeader } = await createAuthenticatedUser(db, jwtService);
      const created = await createAddressViaApi(authHeader);

      const badBodies = [
        {},
        { isDefault: false },
        { latitude: 10.7 },
        { userId: UUID_V4 },
        { city: "TP. Hồ Chí Minh" },
      ];
      for (const body of badBodies) {
        await request(getHttpServer())
          .patch(`/api/v1/users/me/addresses/${created.id}`)
          .set(authHeader)
          .send(body)
          .expect(400);
      }

      for (const badId of ["not-a-uuid", UUID_V4]) {
        await request(getHttpServer())
          .patch(`/api/v1/users/me/addresses/${badId}`)
          .set(authHeader)
          .send({ receiverName: "Valid" })
          .expect(400);
      }
    });

    // Invariant: INV-ADDR-4
    it("returns not found when updating another user address", async () => {
      const owner = await createAuthenticatedUser(db, jwtService);
      const attacker = await createAuthenticatedUser(db, jwtService);
      const created = await createAddressViaApi(owner.authHeader);

      const res = await request(getHttpServer())
        .patch(`/api/v1/users/me/addresses/${created.id}`)
        .set(attacker.authHeader)
        .send({ receiverName: "Hijacked" })
        .expect(404);

      expect((res.body as Rfc9457Error).code).toBe(
        API_ERROR_CODES.ADDRESS_NOT_FOUND,
      );
    });
  });

  describe("PATCH /api/v1/users/me/addresses/:id/default", () => {
    // Invariant: INV-ADDR-2
    it("keeps the address as default idempotently when already default", async () => {
      const { authHeader } = await createAuthenticatedUser(db, jwtService);
      const created = await createAddressViaApi(authHeader);

      const res = await request(getHttpServer())
        .patch(`/api/v1/users/me/addresses/${created.id}/default`)
        .set(authHeader)
        .expect(200);

      const { data } = res.body as ApiResponseEnvelope<AddressResponse>;
      expect(data.id).toBe(created.id);
      expect(data.isDefault).toBe(true);
    });

    it("rejects malformed and UUIDv4 path parameters", async () => {
      const { authHeader } = await createAuthenticatedUser(db, jwtService);

      for (const badId of ["not-a-uuid", UUID_V4]) {
        await request(getHttpServer())
          .patch(`/api/v1/users/me/addresses/${badId}/default`)
          .set(authHeader)
          .expect(400);
      }
    });

    // Invariant: INV-ADDR-2
    it("keeps exactly one default address under two concurrent default requests", async () => {
      const { user, authHeader } = await createAuthenticatedUser(
        db,
        jwtService,
      );

      const addr1 = await createAddressViaApi(authHeader, {
        receiverName: "Address 1",
      });
      const addr2 = await createAddressViaApi(authHeader, {
        receiverName: "Address 2",
        districtCode: THU_DUC.code,
      });
      const addr3 = await createAddressViaApi(authHeader, {
        receiverName: "Address 3",
        districtCode: QUAN_1.code,
      });

      const [switch2, switch3] = await Promise.all([
        request(getHttpServer())
          .patch(`/api/v1/users/me/addresses/${addr2.id}/default`)
          .set(authHeader),
        request(getHttpServer())
          .patch(`/api/v1/users/me/addresses/${addr3.id}/default`)
          .set(authHeader),
      ]);

      expect(switch2.status).toBe(200);
      expect(switch3.status).toBe(200);

      const rows = await db
        .select()
        .from(userAddresses)
        .where(eq(userAddresses.userId, user.id));
      const defaults = rows.filter((r) => r.isDefault);
      expect(defaults).toHaveLength(1);
      expect([addr2.id, addr3.id]).toContain(defaults[0]?.id ?? "");
      expect(defaults[0]?.id).not.toBe(addr1.id);
    });

    // Invariant: INV-ADDR-4
    it("returns not found when defaulting another user address", async () => {
      const owner = await createAuthenticatedUser(db, jwtService);
      const attacker = await createAuthenticatedUser(db, jwtService);
      const created = await createAddressViaApi(owner.authHeader);

      const res = await request(getHttpServer())
        .patch(`/api/v1/users/me/addresses/${created.id}/default`)
        .set(attacker.authHeader)
        .expect(404);

      expect((res.body as Rfc9457Error).code).toBe(
        API_ERROR_CODES.ADDRESS_NOT_FOUND,
      );
    });
  });

  describe("DELETE /api/v1/users/me/addresses/:id", () => {
    it("rejects malformed and UUIDv4 path parameters", async () => {
      const { authHeader } = await createAuthenticatedUser(db, jwtService);

      for (const badId of ["not-a-uuid", UUID_V4]) {
        await request(getHttpServer())
          .delete(`/api/v1/users/me/addresses/${badId}`)
          .set(authHeader)
          .expect(400);
      }
    });

    // Invariant: INV-ADDR-5
    it("promotes the most recently created remaining address when deleting the default", async () => {
      const { user, authHeader } = await createAuthenticatedUser(
        db,
        jwtService,
      );

      const first = await createAddressViaApi(authHeader, {
        receiverName: "First (Default)",
      });
      await createAddressViaApi(authHeader, {
        receiverName: "Older Remaining",
      });
      const newest = await createAddressViaApi(authHeader, {
        receiverName: "Newest Remaining",
      });

      await request(getHttpServer())
        .delete(`/api/v1/users/me/addresses/${first.id}`)
        .set(authHeader)
        .expect(204);

      const remaining = await db
        .select()
        .from(userAddresses)
        .where(eq(userAddresses.userId, user.id));
      expect(remaining).toHaveLength(2);
      const promoted = remaining.find((r) => r.isDefault);
      expect(promoted?.id).toBe(newest.id);
    });

    // Invariant: INV-ADDR-2
    it("hard-deletes the sole address without failing default continuity and preserves order and subscription snapshots", async () => {
      const { user, authHeader } = await createAuthenticatedUser(
        db,
        jwtService,
      );
      const created = await createAddressViaApi(authHeader);

      const snapshotText = "12 Nguyen Van Linh, Quận 7, TP. Hồ Chí Minh";
      const [sub] = await db
        .insert(subscriptions)
        .values({
          customerId: user.id,
          userAddressId: created.id,
          shippingAddress: snapshotText,
          shippingDistanceKm: "12.50",
          shippingFeePerDelivery: 0,
          planName: "Gói Rau Gia Đình",
          price: 1200000,
          totalDeliveries: 8,
          weightPerDeliveryKg: "5.00",
          basketDescription: "Rau theo mùa",
          deliveryDay: DeliveryDay.TUESDAY,
          remainingDeliveries: 8,
          status: SubscriptionStatus.ACTIVE,
          startDate: "2026-11-19",
          endDate: "2026-12-19",
        })
        .returning();

      const [order] = await db
        .insert(orders)
        .values({
          orderCode: "ORD-20261119-001",
          customerId: user.id,
          subscriptionId: sub!.id,
          shippingAddress: snapshotText,
          shippingDistanceKm: "12.50",
          shippingFee: 76750,
          subtotal: 125000,
          discountAmount: 0,
          totalAmount: 201750,
          paymentMethod: PaymentMethod.COD,
          paymentStatus: PaymentStatus.PENDING,
          orderStatus: OrderStatus.PENDING_CONFIRMATION,
        })
        .returning();

      await request(getHttpServer())
        .delete(`/api/v1/users/me/addresses/${created.id}`)
        .set(authHeader)
        .expect(204);

      const remaining = await db
        .select()
        .from(userAddresses)
        .where(eq(userAddresses.userId, user.id));
      expect(remaining).toHaveLength(0);

      const [persistedSub] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.id, sub!.id))
        .limit(1);
      // Worker schemas cloned with `LIKE ... INCLUDING ALL` omit cross-table FKs,
      // so this test asserts the immutable shipping snapshots survive hard deletion.
      expect(persistedSub?.shippingAddress).toBe(snapshotText);

      const [persistedOrder] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, order!.id))
        .limit(1);
      expect(persistedOrder?.shippingAddress).toBe(snapshotText);
    });

    // Invariant: INV-ADDR-4
    it("returns not found when deleting another user address", async () => {
      const owner = await createAuthenticatedUser(db, jwtService);
      const attacker = await createAuthenticatedUser(db, jwtService);
      const created = await createAddressViaApi(owner.authHeader);

      const res = await request(getHttpServer())
        .delete(`/api/v1/users/me/addresses/${created.id}`)
        .set(attacker.authHeader)
        .expect(404);

      expect((res.body as Rfc9457Error).code).toBe(
        API_ERROR_CODES.ADDRESS_NOT_FOUND,
      );
    });

    // Invariant: INV-ADDR-2
    it("preserves single-default invariant when deleting the default concurrently with switching default", async () => {
      const { user, authHeader } = await createAuthenticatedUser(
        db,
        jwtService,
      );

      const addr1 = await createAddressViaApi(authHeader, {
        receiverName: "Default 1",
      });
      const addr2 = await createAddressViaApi(authHeader, {
        receiverName: "Candidate 2",
      });

      const [delRes, defRes] = await Promise.all([
        request(getHttpServer())
          .delete(`/api/v1/users/me/addresses/${addr1.id}`)
          .set(authHeader),
        request(getHttpServer())
          .patch(`/api/v1/users/me/addresses/${addr2.id}/default`)
          .set(authHeader),
      ]);

      expect(delRes.status).toBe(204);
      expect(defRes.status).toBe(200);

      const remaining = await db
        .select()
        .from(userAddresses)
        .where(eq(userAddresses.userId, user.id));
      expect(remaining).toHaveLength(1);
      expect(remaining[0]?.id).toBe(addr2.id);
      expect(remaining[0]?.isDefault).toBe(true);
    });
  });
});
