import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  API_ERROR_CODES,
  BUSINESS_RULES,
  type ComplaintProofImageUrls,
  type ComplaintResolution,
  ComplaintStatus,
  OrderStatus,
  type PaymentMethod,
} from "@greenroots/shared";
import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  type SQL,
} from "drizzle-orm";
import { PG_ERROR_CODE } from "@/common/constants/error.constant";
import { MESSAGES } from "@/common/constants/messages.constant";
import { TIME_IN_MS } from "@/common/constants/time.constant";
import type { PaginationMetaDto } from "@/common/dto/api-response.dto";
import { buildPaginationMeta } from "@/common/utils/api-response.util";
import { escapeLikePattern } from "@/common/utils/query.util";
import {
  DATABASE_CONNECTION,
  type DrizzleDB,
} from "@/database/database.module";
import { complaints, orders, users } from "@/database/schemas";
import { CloudinaryService } from "@/modules/media/cloudinary.service";
import type {
  ComplaintProjection,
  CreateComplaintInput,
  ListComplaintsQuery,
  StaffComplaintProjection,
  TriageComplaintInput,
} from "./dto";

const COMPLAINT_WINDOW_MS =
  BUSINESS_RULES.COMPLAINT_WINDOW_HOURS * TIME_IN_MS.HOUR;

const STAFF_COMPLAINT_SELECT = {
  id: complaints.id,
  orderId: complaints.orderId,
  orderCode: orders.orderCode,
  orderTotalVnd: orders.totalAmount,
  orderPaymentMethod: orders.paymentMethod,
  orderDeliveredAt: orders.deliveredAt,
  customerId: complaints.customerId,
  customerName: users.fullName,
  customerPhone: users.phone,
  reason: complaints.reason,
  proofImageUrls: complaints.proofImageUrls,
  proofVideoUrl: complaints.proofVideoUrl,
  status: complaints.status,
  resolution: complaints.resolution,
  triagedBy: complaints.triagedBy,
  triagedAt: complaints.triagedAt,
  triageNote: complaints.triageNote,
  resolvedBy: complaints.resolvedBy,
  createdAt: complaints.createdAt,
  updatedAt: complaints.updatedAt,
} as const;

type RawStaffComplaintRow = {
  id: string;
  orderId: string;
  orderCode: string;
  orderTotalVnd: number;
  orderPaymentMethod: PaymentMethod;
  orderDeliveredAt: Date | null;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  reason: string;
  proofImageUrls: ComplaintProofImageUrls;
  proofVideoUrl: string | null;
  status: ComplaintStatus;
  resolution: ComplaintResolution | null;
  triagedBy: string | null;
  triagedAt: Date | null;
  triageNote: string | null;
  resolvedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toStaffComplaintProjection(
  row: RawStaffComplaintRow,
): StaffComplaintProjection {
  return {
    id: row.id,
    orderId: row.orderId,
    orderCode: row.orderCode,
    orderTotalVnd: row.orderTotalVnd,
    orderPaymentMethod: row.orderPaymentMethod,
    orderDeliveredAt: row.orderDeliveredAt
      ? row.orderDeliveredAt.toISOString()
      : null,
    customerId: row.customerId,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    reason: row.reason,
    proofImageUrls: row.proofImageUrls,
    proofVideoUrl: row.proofVideoUrl,
    status: row.status,
    resolution: row.resolution,
    triagedBy: row.triagedBy,
    triagedAt: row.triagedAt ? row.triagedAt.toISOString() : null,
    triageNote: row.triageNote,
    resolvedBy: row.resolvedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const record = error as { code?: unknown; cause?: { code?: unknown } };
  return (
    record.code === PG_ERROR_CODE.UNIQUE_VIOLATION ||
    record.cause?.code === PG_ERROR_CODE.UNIQUE_VIOLATION
  );
}

/**
 * Complaint domain service handling customer submission (`ADR-0040`) and
 * staff listing and one-shot triage (`ADR-0045`).
 */
@Injectable()
export class ComplaintsService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DrizzleDB,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  /**
   * Submits a complaint for an owned delivered/completed order within 24 hours of `deliveredAt`.
   */
  async submitComplaint(
    customerId: string,
    orderId: string,
    input: CreateComplaintInput,
    now: Date = new Date(),
  ): Promise<ComplaintProjection> {
    const [orderRow] = await this.db
      .select({
        id: orders.id,
        customerId: orders.customerId,
        orderStatus: orders.orderStatus,
        deliveredAt: orders.deliveredAt,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!orderRow || orderRow.customerId !== customerId) {
      throw new NotFoundException({
        code: API_ERROR_CODES.ORDER_NOT_FOUND,
        detail: MESSAGES.ORDERS.NOT_FOUND,
      });
    }

    const isEligibleStatus =
      orderRow.orderStatus === OrderStatus.DELIVERED ||
      orderRow.orderStatus === OrderStatus.COMPLETED;

    if (!isEligibleStatus || orderRow.deliveredAt === null) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.ORDER_COMPLAINT_NOT_ELIGIBLE,
        detail: MESSAGES.COMPLAINTS.NOT_ELIGIBLE,
      });
    }

    if (now.getTime() - orderRow.deliveredAt.getTime() > COMPLAINT_WINDOW_MS) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.ORDER_COMPLAINT_WINDOW_EXPIRED,
        detail: MESSAGES.COMPLAINTS.WINDOW_EXPIRED,
      });
    }

    const [existingComplaint] = await this.db
      .select({ id: complaints.id })
      .from(complaints)
      .where(eq(complaints.orderId, orderId))
      .limit(1);

    if (existingComplaint) {
      throw new ConflictException({
        code: API_ERROR_CODES.ORDER_COMPLAINT_ALREADY_EXISTS,
        detail: MESSAGES.COMPLAINTS.ALREADY_EXISTS,
      });
    }

    // Verify uploaded media metadata via Cloudinary Admin API strictly outside any DB transaction (`ADR-0040`).
    await this.cloudinaryService.verifyComplaintMedia(
      input.proofImageUrls,
      input.proofVideoUrl,
    );

    try {
      const [created] = await this.db
        .insert(complaints)
        .values({
          orderId,
          customerId,
          reason: input.reason,
          proofImageUrls: input.proofImageUrls,
          proofVideoUrl: input.proofVideoUrl ?? null,
        })
        .returning({
          id: complaints.id,
          orderId: complaints.orderId,
          customerId: complaints.customerId,
          reason: complaints.reason,
          proofImageUrls: complaints.proofImageUrls,
          proofVideoUrl: complaints.proofVideoUrl,
          status: complaints.status,
          resolution: complaints.resolution,
          createdAt: complaints.createdAt,
          updatedAt: complaints.updatedAt,
        });

      if (!created) {
        throw new Error("Failed to insert complaint.");
      }

      return {
        id: created.id,
        orderId: created.orderId,
        customerId: created.customerId,
        reason: created.reason,
        proofImageUrls: created.proofImageUrls,
        proofVideoUrl: created.proofVideoUrl,
        status: created.status,
        resolution: created.resolution,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({
          code: API_ERROR_CODES.ORDER_COMPLAINT_ALREADY_EXISTS,
          detail: MESSAGES.COMPLAINTS.ALREADY_EXISTS,
        });
      }
      throw error;
    }
  }

  /**
   * Lists paginated, filtered, and hydrated complaints for authorized staff (`ADR-0045`).
   *
   * @param query Validated pagination, filter, date range, and search parameters.
   * @returns Hydrated staff complaint projections and pagination metadata.
   */
  async listComplaints(query: ListComplaintsQuery): Promise<{
    items: StaffComplaintProjection[];
    meta: PaginationMetaDto;
  }> {
    const conditions: SQL[] = [];

    if (query.status !== undefined) {
      conditions.push(eq(complaints.status, query.status));
    }
    if (query.resolution !== undefined) {
      conditions.push(eq(complaints.resolution, query.resolution));
    }
    if (query.orderId !== undefined) {
      conditions.push(eq(complaints.orderId, query.orderId));
    }
    if (query.customerId !== undefined) {
      conditions.push(eq(complaints.customerId, query.customerId));
    }
    if (query.from !== undefined) {
      conditions.push(gte(complaints.createdAt, new Date(query.from)));
    }
    if (query.to !== undefined) {
      conditions.push(lte(complaints.createdAt, new Date(query.to)));
    }
    if (query.search !== undefined) {
      const pattern = `%${escapeLikePattern(query.search)}%`;
      const searchCondition = or(
        ilike(orders.orderCode, pattern),
        ilike(users.phone, pattern),
        ilike(users.fullName, pattern),
      );
      if (searchCondition) {
        conditions.push(searchCondition);
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const countBase = this.db.select({ total: count() }).from(complaints);
    const [countRow] = await (
      query.search !== undefined
        ? countBase
            .innerJoin(orders, eq(complaints.orderId, orders.id))
            .innerJoin(users, eq(complaints.customerId, users.id))
        : countBase
    ).where(whereClause);

    const total = Number(countRow?.total ?? 0);
    const meta = buildPaginationMeta(total, query.page, query.limit);
    const offset = (query.page - 1) * query.limit;

    if (total === 0 || offset >= total) {
      return { items: [], meta };
    }

    const rows = await this.db
      .select(STAFF_COMPLAINT_SELECT)
      .from(complaints)
      .innerJoin(orders, eq(complaints.orderId, orders.id))
      .innerJoin(users, eq(complaints.customerId, users.id))
      .where(whereClause)
      .orderBy(desc(complaints.createdAt), desc(complaints.id))
      .limit(query.limit)
      .offset(offset);

    return {
      items: rows.map(toStaffComplaintProjection),
      meta,
    };
  }

  /**
   * Transitions a `pending` complaint to `triaged` or `rejected` under a `FOR UPDATE` row lock (`INV-CMP-6`, `INV-CMP-7`).
   *
   * @param actorId Authenticated staff user UUIDv7 performing the triage.
   * @param complaintId Target complaint UUIDv7 identifier.
   * @param input Validated triage status and optional/mandatory note.
   * @param now Timestamp override for deterministic testing.
   * @returns Hydrated staff complaint projection.
   */
  async triageComplaint(
    actorId: string,
    complaintId: string,
    input: TriageComplaintInput,
    now: Date = new Date(),
  ): Promise<StaffComplaintProjection> {
    await this.db.transaction(async (tx) => {
      const [locked] = await tx
        .select({
          id: complaints.id,
          status: complaints.status,
        })
        .from(complaints)
        .where(eq(complaints.id, complaintId))
        .for("update");

      if (!locked) {
        throw new NotFoundException({
          code: API_ERROR_CODES.COMPLAINT_NOT_FOUND,
          detail: MESSAGES.COMPLAINTS.NOT_FOUND,
        });
      }

      if (locked.status !== ComplaintStatus.PENDING) {
        throw new UnprocessableEntityException({
          code: API_ERROR_CODES.COMPLAINT_INVALID_STATUS_TRANSITION,
          detail: MESSAGES.COMPLAINTS.INVALID_STATUS_TRANSITION,
        });
      }

      const normalizedNote =
        input.triageNote && input.triageNote.length > 0
          ? input.triageNote
          : null;

      await tx
        .update(complaints)
        .set({
          status: input.status,
          triagedBy: actorId,
          triagedAt: now,
          triageNote: normalizedNote,
          updatedAt: now,
        })
        .where(eq(complaints.id, complaintId));
    });

    return this.findStaffComplaintById(complaintId);
  }

  private async findStaffComplaintById(
    complaintId: string,
  ): Promise<StaffComplaintProjection> {
    const [row] = await this.db
      .select(STAFF_COMPLAINT_SELECT)
      .from(complaints)
      .innerJoin(orders, eq(complaints.orderId, orders.id))
      .innerJoin(users, eq(complaints.customerId, users.id))
      .where(eq(complaints.id, complaintId))
      .limit(1);

    if (!row) {
      throw new NotFoundException({
        code: API_ERROR_CODES.COMPLAINT_NOT_FOUND,
        detail: MESSAGES.COMPLAINTS.NOT_FOUND,
      });
    }

    return toStaffComplaintProjection(row);
  }
}
