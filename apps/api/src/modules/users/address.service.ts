import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  API_ERROR_CODES,
  BUSINESS_RULES,
  findHcmcDistrictByCode,
  type HcmcDistrictCoordinate,
} from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import {
  DATABASE_CONNECTION,
  type DrizzleDB,
  type DrizzleTx,
} from "@/database/database.module";
import {
  userAddresses,
  users,
  type NewUserAddress,
  type UserAddress,
} from "@/database/schemas";
import type { Address, CreateAddressInput, UpdateAddressInput } from "./dto";
import type { ResolvedQuoteAddress } from "./users.interface";

/**
 * Closed Drizzle column projection for customer address responses.
 * Excludes `userId` and internal cached `latitude`/`longitude` coordinates.
 */
export const ADDRESS_COLUMNS = {
  id: userAddresses.id,
  receiverName: userAddresses.receiverName,
  phoneNumber: userAddresses.phoneNumber,
  streetAddress: userAddresses.streetAddress,
  districtCode: userAddresses.districtCode,
  district: userAddresses.district,
  city: userAddresses.city,
  isDefault: userAddresses.isDefault,
  createdAt: userAddresses.createdAt,
  updatedAt: userAddresses.updatedAt,
} as const;

type AddressRow = Pick<UserAddress, keyof typeof ADDRESS_COLUMNS>;

/**
 * Manages customer delivery addresses, district-centroid derivation, 10-row caps, and single-default guarantees.
 */
@Injectable()
export class AddressService {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: DrizzleDB,
  ) {}

  private toAddress(row: AddressRow): Address {
    return {
      id: row.id,
      receiverName: row.receiverName,
      phoneNumber: row.phoneNumber,
      streetAddress: row.streetAddress,
      districtCode: row.districtCode,
      district: row.district,
      city: row.city,
      isDefault: row.isDefault,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toDistrictFields(district: HcmcDistrictCoordinate) {
    return {
      districtCode: district.code,
      district: district.name,
      city: BUSINESS_RULES.DEFAULT_DELIVERY_CITY,
      latitude: district.latitude.toFixed(8),
      longitude: district.longitude.toFixed(8),
    };
  }

  private addressNotFound(): NotFoundException {
    return new NotFoundException({
      code: API_ERROR_CODES.ADDRESS_NOT_FOUND,
      detail: MESSAGES.ADDRESS.NOT_FOUND,
    });
  }

  private resolveDistrictOrThrow(districtCode: string): HcmcDistrictCoordinate {
    const district = findHcmcDistrictByCode(districtCode);
    if (!district) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.DISTRICT_CODE_INVALID,
        detail: MESSAGES.ADDRESS.DISTRICT_CODE_INVALID,
      });
    }
    return district;
  }

  private async ensureLiveUser(
    executor: DrizzleDB | DrizzleTx,
    sub: string,
    lockForUpdate: boolean,
  ): Promise<void> {
    const baseQuery = executor
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, sub), isNull(users.deletedAt)));

    // Lock the parent user row first (`users -> user_addresses`) on mutations to serialize per-user
    // writes under READ COMMITTED and prevent 10-row phantom inserts or default 23505 collisions.
    const [row] = lockForUpdate
      ? await baseQuery.for("update")
      : await baseQuery.limit(1);

    if (!row) {
      throw new UnauthorizedException({
        code: API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
        detail: MESSAGES.AUTH.TOKEN_INVALID_OR_EXPIRED,
      });
    }
  }

  /**
   * Lists saved delivery addresses for a live user ordered with the default address first.
   *
   * @param sub Authenticated user ID from JWT `sub`.
   * @returns Closed `Address` array ordered by `isDefault DESC, createdAt DESC`.
   */
  async listAddresses(sub: string): Promise<Address[]> {
    await this.ensureLiveUser(this.db, sub, false);

    const rows = await this.db
      .select(ADDRESS_COLUMNS)
      .from(userAddresses)
      .where(eq(userAddresses.userId, sub))
      .orderBy(desc(userAddresses.isDefault), desc(userAddresses.createdAt));

    return rows.map((row) => this.toAddress(row));
  }

  /**
   * Creates a new delivery address with server-derived district metadata and centroid coordinates.
   *
   * @param sub Authenticated user ID from JWT `sub`.
   * @param input Validated creation payload (`districtCode` only, no client coordinates or `city`).
   * @returns Newly persisted `Address` projection.
   */
  async createAddress(
    sub: string,
    input: CreateAddressInput,
  ): Promise<Address> {
    const district = this.resolveDistrictOrThrow(input.districtCode);

    return this.db.transaction(async (tx) => {
      await this.ensureLiveUser(tx, sub, true);

      const existing = await tx
        .select({ id: userAddresses.id })
        .from(userAddresses)
        .where(eq(userAddresses.userId, sub));

      if (existing.length >= BUSINESS_RULES.MAX_USER_ADDRESSES) {
        throw new UnprocessableEntityException({
          code: API_ERROR_CODES.ADDRESS_LIMIT_REACHED,
          detail: MESSAGES.ADDRESS.LIMIT_REACHED,
        });
      }

      const shouldBeDefault = existing.length === 0 || input.isDefault === true;

      if (existing.length > 0 && shouldBeDefault) {
        await tx
          .update(userAddresses)
          .set({ isDefault: false })
          .where(
            and(
              eq(userAddresses.userId, sub),
              eq(userAddresses.isDefault, true),
            ),
          );
      }

      const [created] = await tx
        .insert(userAddresses)
        .values({
          userId: sub,
          receiverName: input.receiverName,
          phoneNumber: input.phoneNumber,
          streetAddress: input.streetAddress,
          ...this.toDistrictFields(district),
          isDefault: shouldBeDefault,
        })
        .returning(ADDRESS_COLUMNS);

      if (!created) {
        throw this.addressNotFound();
      }

      return this.toAddress(created);
    });
  }

  /**
   * Updates mutable content fields on an owned address and recomputes cached coordinates on district change.
   *
   * @param sub Authenticated user ID from JWT `sub`.
   * @param addressId Target address UUIDv7 identifier.
   * @param patch Validated partial patch containing at least one mutable field.
   * @returns Updated `Address` projection.
   */
  async updateAddress(
    sub: string,
    addressId: string,
    patch: UpdateAddressInput,
  ): Promise<Address> {
    const resolvedDistrict =
      patch.districtCode !== undefined
        ? this.resolveDistrictOrThrow(patch.districtCode)
        : undefined;

    const values: Partial<NewUserAddress> = {};
    if (patch.receiverName !== undefined) {
      values.receiverName = patch.receiverName;
    }
    if (patch.phoneNumber !== undefined) {
      values.phoneNumber = patch.phoneNumber;
    }
    if (patch.streetAddress !== undefined) {
      values.streetAddress = patch.streetAddress;
    }
    if (resolvedDistrict !== undefined) {
      Object.assign(values, this.toDistrictFields(resolvedDistrict));
    }

    return this.db.transaction(async (tx) => {
      await this.ensureLiveUser(tx, sub, true);

      const [updated] = await tx
        .update(userAddresses)
        .set(values)
        .where(
          and(eq(userAddresses.id, addressId), eq(userAddresses.userId, sub)),
        )
        .returning(ADDRESS_COLUMNS);

      if (!updated) {
        throw this.addressNotFound();
      }

      return this.toAddress(updated);
    });
  }

  /**
   * Marks an owned address as the account's sole default delivery address.
   *
   * @param sub Authenticated user ID from JWT `sub`.
   * @param addressId Target address UUIDv7 identifier.
   * @returns Updated (or already default) `Address` projection.
   */
  async setDefaultAddress(sub: string, addressId: string): Promise<Address> {
    return this.db.transaction(async (tx) => {
      await this.ensureLiveUser(tx, sub, true);

      const [target] = await tx
        .select(ADDRESS_COLUMNS)
        .from(userAddresses)
        .where(
          and(eq(userAddresses.id, addressId), eq(userAddresses.userId, sub)),
        )
        .limit(1);

      if (!target) {
        throw this.addressNotFound();
      }

      if (target.isDefault) {
        return this.toAddress(target);
      }

      await tx
        .update(userAddresses)
        .set({ isDefault: false })
        .where(
          and(eq(userAddresses.userId, sub), eq(userAddresses.isDefault, true)),
        );

      const [updated] = await tx
        .update(userAddresses)
        .set({ isDefault: true })
        .where(
          and(eq(userAddresses.id, addressId), eq(userAddresses.userId, sub)),
        )
        .returning(ADDRESS_COLUMNS);

      if (!updated) {
        throw this.addressNotFound();
      }

      return this.toAddress(updated);
    });
  }

  /**
   * Hard-deletes an owned address and promotes the most recently created remaining address if it was default.
   *
   * @param sub Authenticated user ID from JWT `sub`.
   * @param addressId Target address UUIDv7 identifier.
   */
  async removeAddress(sub: string, addressId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.ensureLiveUser(tx, sub, true);

      const [deleted] = await tx
        .delete(userAddresses)
        .where(
          and(eq(userAddresses.id, addressId), eq(userAddresses.userId, sub)),
        )
        .returning({
          id: userAddresses.id,
          isDefault: userAddresses.isDefault,
        });

      if (!deleted) {
        throw this.addressNotFound();
      }

      if (deleted.isDefault) {
        const [newest] = await tx
          .select({ id: userAddresses.id })
          .from(userAddresses)
          .where(eq(userAddresses.userId, sub))
          .orderBy(desc(userAddresses.createdAt), desc(userAddresses.id))
          .limit(1);

        if (newest) {
          await tx
            .update(userAddresses)
            .set({ isDefault: true })
            .where(
              and(
                eq(userAddresses.id, newest.id),
                eq(userAddresses.userId, sub),
              ),
            );
        }
      }
    });
  }

  private toResolvedQuoteAddress(row: AddressRow): ResolvedQuoteAddress {
    const district = this.resolveDistrictOrThrow(row.districtCode);

    return {
      id: row.id,
      receiverName: row.receiverName,
      phoneNumber: row.phoneNumber,
      formattedAddress: `${row.streetAddress}, ${district.name}, ${BUSINESS_RULES.DEFAULT_DELIVERY_CITY}`,
      districtCode: district.code,
      district: district.name,
      city: BUSINESS_RULES.DEFAULT_DELIVERY_CITY,
      latitude: district.latitude,
      longitude: district.longitude,
    };
  }

  /**
   * Resolves an owned address (or the account's default address) with authoritative centroid coordinates
   * from `HCMC_DISTRICTS` for downstream checkout and subscription fee estimation.
   *
   * @param sub Authenticated user ID from JWT `sub`.
   * @param addressId Optional address UUIDv7; falls back to the account's default address when omitted.
   * @returns Formatted shipping address snapshot, recipient contact details, and authoritative `HCMC_DISTRICTS` centroid coordinates.
   */
  async resolveAddressForQuote(
    sub: string,
    addressId?: string,
  ): Promise<ResolvedQuoteAddress> {
    await this.ensureLiveUser(this.db, sub, false);

    const condition = addressId
      ? and(eq(userAddresses.id, addressId), eq(userAddresses.userId, sub))
      : and(eq(userAddresses.userId, sub), eq(userAddresses.isDefault, true));

    const [row] = await this.db
      .select(ADDRESS_COLUMNS)
      .from(userAddresses)
      .where(condition)
      .limit(1);

    if (!row) {
      throw this.addressNotFound();
    }

    return this.toResolvedQuoteAddress(row);
  }

  /**
   * Resolves the account's default saved address when present, returning `null` if no address exists yet.
   *
   * @param sub Authenticated user ID from JWT `sub`.
   * @returns Default `ResolvedQuoteAddress` or `null` when the customer has no saved addresses.
   */
  async resolveOptionalDefaultAddressForQuote(
    sub: string,
  ): Promise<ResolvedQuoteAddress | null> {
    await this.ensureLiveUser(this.db, sub, false);

    const [row] = await this.db
      .select(ADDRESS_COLUMNS)
      .from(userAddresses)
      .where(
        and(eq(userAddresses.userId, sub), eq(userAddresses.isDefault, true)),
      )
      .limit(1);

    return row ? this.toResolvedQuoteAddress(row) : null;
  }
}
