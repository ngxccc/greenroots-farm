import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { API_ERROR_CODES } from "@greenroots/shared";
import { MESSAGES } from "@/common/constants/messages.constant";
import { RedisService } from "@/common/services/redis.service";
import {
  GEOCODING_AUTOCOMPLETE_CACHE_PREFIX,
  GEOCODING_AUTOCOMPLETE_TTL_SECONDS,
  GEOCODING_DRIVER_TOKEN,
  GEOCODING_PLACE_CACHE_PREFIX,
  GEOCODING_PLACE_TTL_SECONDS,
} from "./geocoding.constant";
import type {
  GeocodingDriver,
  PlaceSuggestion,
  ResolvedPlace,
} from "./geocoding.interface";

/**
 * Orchestrates place autocomplete and server-side coordinate resolution with
 * Redis caching and fail-closed `503 GEOCODING_UNAVAILABLE` translation (`INV-GEO-1`).
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);

  constructor(
    private readonly redisService: RedisService,
    @Inject(GEOCODING_DRIVER_TOKEN)
    private readonly driver: GeocodingDriver,
  ) {}

  private normalizeQueryKey(query: string): string {
    return query.trim().toLowerCase().replace(/\s+/g, " ");
  }

  private async readCache<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redisService.getClient().get(key);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger.warn(
        `Geocoding Redis read failed for ${key}: ${error instanceof Error ? error.message : "unknown"}`,
      );
      return null;
    }
  }

  private async writeCache(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    try {
      await this.redisService
        .getClient()
        .set(key, JSON.stringify(value), "EX", ttlSeconds);
    } catch (error) {
      this.logger.warn(
        `Geocoding Redis write failed for ${key}: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  /**
   * Returns Ho Chi Minh City address suggestions for a validated query string (`>= 3` chars).
   */
  async autocomplete(query: string): Promise<PlaceSuggestion[]> {
    const normalized = this.normalizeQueryKey(query);
    const cacheKey = `${GEOCODING_AUTOCOMPLETE_CACHE_PREFIX}${normalized}`;

    const cached = await this.readCache<PlaceSuggestion[]>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    let suggestions: PlaceSuggestion[];
    try {
      suggestions = await this.driver.autocomplete(query.trim());
    } catch (error) {
      this.logger.warn(
        `Geocoding autocomplete failed: ${error instanceof Error ? error.message : "unknown"}`,
      );
      throw new ServiceUnavailableException({
        code: API_ERROR_CODES.GEOCODING_UNAVAILABLE,
        detail: MESSAGES.GEOCODING.UNAVAILABLE,
      });
    }

    await this.writeCache(
      cacheKey,
      suggestions,
      GEOCODING_AUTOCOMPLETE_TTL_SECONDS,
    );
    return suggestions;
  }

  /**
   * Resolves a `placeId` to verified coordinates and display district server-side (`INV-GEO-1`).
   * Fails closed with `503 GEOCODING_UNAVAILABLE` on upstream errors or `422 PLACE_ID_INVALID` when not found.
   */
  async resolvePlace(placeId: string): Promise<ResolvedPlace> {
    const trimmedPlaceId = placeId.trim();
    const cacheKey = `${GEOCODING_PLACE_CACHE_PREFIX}${trimmedPlaceId}`;

    const cached = await this.readCache<ResolvedPlace>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    let resolved: ResolvedPlace | null;
    try {
      resolved = await this.driver.resolvePlace(trimmedPlaceId);
    } catch (error) {
      this.logger.warn(
        `Geocoding resolvePlace failed: ${error instanceof Error ? error.message : "unknown"}`,
      );
      throw new ServiceUnavailableException({
        code: API_ERROR_CODES.GEOCODING_UNAVAILABLE,
        detail: MESSAGES.GEOCODING.UNAVAILABLE,
      });
    }

    if (!resolved) {
      throw new UnprocessableEntityException({
        code: API_ERROR_CODES.PLACE_ID_INVALID,
        detail: MESSAGES.GEOCODING.PLACE_ID_INVALID,
      });
    }

    await this.writeCache(cacheKey, resolved, GEOCODING_PLACE_TTL_SECONDS);
    return resolved;
  }
}
