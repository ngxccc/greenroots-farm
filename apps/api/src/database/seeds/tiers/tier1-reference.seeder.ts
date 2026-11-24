import { BUSINESS_RULES, UserRole, UserStatus } from "@greenroots/shared";
import { env } from "@/common/config/env.config";
import type { DrizzleDB } from "@/database/database.module";
import { farms, users } from "@/database/schemas";
import { hashPassword } from "@/common/utils/crypto.util";
import { SEED_IDS } from "../constants/seed-ids.constant";
import { SEED_ACCOUNT_PASSWORD } from "../constants/seed-passwords.constant";

interface Tier1Result {
  farms: number;
  users: number;
}

/**
 * Tier 1 - reference data: the singleton farm and the six RBAC accounts.
 */
export async function seedTier1Reference(db: DrizzleDB): Promise<Tier1Result> {
  const passwordHash = await hashPassword(SEED_ACCOUNT_PASSWORD);
  const cloudName = env.CLOUDINARY_CLOUD_NAME;

  await db
    .insert(farms)
    .values({
      id: SEED_IDS.farm,
      name: BUSINESS_RULES.FULFILLMENT_HUB.NAME,
      legalName: "Công ty TNHH Nông nghiệp Hữu cơ GreenRoots",
      tagline: "Nông sản sạch Đà Lạt — Chuỗi lạnh hỏa tốc trong ngày",
      taxId: "0316987654",
      address: BUSINESS_RULES.FULFILLMENT_HUB.ADDRESS,
      latitude: String(BUSINESS_RULES.FULFILLMENT_HUB.LATITUDE),
      longitude: String(BUSINESS_RULES.FULFILLMENT_HUB.LONGITUDE),
      certificationUrl: `https://res.cloudinary.com/${cloudName}/image/upload/v1/farms/vietgap-certificate.png`,
      hotlines: {
        primary: "0909 123 456",
        support: "028 3899 1234",
      },
      emails: {
        primary: "hello@greenroots.farm",
        support: "hotro@greenroots.farm",
      },
      workingHours: {
        weekdays: "07:00 - 18:00",
        weekend: "07:00 - 12:00",
      },
      bankInfo: {
        bankName: "Vietcombank",
        accountNumber: "0071001234567",
        accountHolder: "CONG TY TNHH NONG NGHIEP HUU CO GREENROOTS",
      },
      shippingConfig: {
        baseFeeVnd: BUSINESS_RULES.SHIPPING.BASE_FEE_VND,
        freeKmThreshold: BUSINESS_RULES.SHIPPING.FREE_KM_THRESHOLD,
        perKmRateVnd: BUSINESS_RULES.SHIPPING.PER_KM_RATE_VND,
        detourFactor: BUSINESS_RULES.SHIPPING.DETOUR_FACTOR,
        maxRadiusKm: BUSINESS_RULES.SHIPPING.MAX_RADIUS_KM,
        subscriptionFreeRadiusKm:
          BUSINESS_RULES.SHIPPING.SUBSCRIPTION_FREE_RADIUS_KM,
      },
      flashSaleConfig: {
        hoursThreshold: BUSINESS_RULES.FLASH_SALE_HOURS_THRESHOLD,
        discountPercent: BUSINESS_RULES.FLASH_SALE_DISCOUNT_PERCENT,
      },
      isPayosEnabled: true,
      isCodEnabled: true,
    })
    .onConflictDoNothing();

  const seededUsers = [
    {
      id: SEED_IDS.superAdmin,
      email: "superadmin@greenroots.farm",
      phone: "0909000001",
      fullName: "Nguyễn Văn Quản Trị",
      role: UserRole.SUPER_ADMIN,
    },
    {
      id: SEED_IDS.admin,
      email: "admin@greenroots.farm",
      phone: "0909000002",
      fullName: "Lê Thị Điều Hành",
      role: UserRole.ADMIN,
    },
    {
      id: SEED_IDS.farmStaff,
      email: "farmstaff@greenroots.farm",
      phone: "0909000003",
      fullName: "Phạm Minh Nông Trại",
      role: UserRole.FARM_STAFF,
    },
    {
      id: SEED_IDS.sales,
      email: "sales@greenroots.farm",
      phone: "0909000004",
      fullName: "Võ Thị Kinh Doanh",
      role: UserRole.SALES,
    },
    {
      id: SEED_IDS.customer,
      email: "customer@greenroots.farm",
      phone: "0909000005",
      fullName: "Trần Thị Khách",
      role: UserRole.CUSTOMER,
    },
    {
      id: SEED_IDS.customerSecond,
      email: "customer2@greenroots.farm",
      phone: "0909000006",
      fullName: "Đặng Văn Mua",
      role: UserRole.CUSTOMER,
    },
  ].map((account) => ({
    ...account,
    password: passwordHash,
    status: UserStatus.ACTIVE,
    emailVerified: true,
  }));

  await db.insert(users).values(seededUsers).onConflictDoNothing();

  return { farms: 1, users: seededUsers.length };
}
