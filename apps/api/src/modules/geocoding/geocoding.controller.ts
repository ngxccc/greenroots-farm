import { Controller, Get, HttpStatus, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { API_ERROR_CODES, UserRole } from "@greenroots/shared";
import {
  ApiAuth,
  ApiBadRequestResponseRfc9457,
  ApiInternalServerErrorResponseRfc9457,
  ApiOkResponseGeneric,
  ApiRfc9457Response,
  ApiTooManyRequestsResponseRfc9457,
} from "@/common/decorators";
import { ERROR_SLUGS, MESSAGES } from "@/common/constants/messages.constant";
import { apiSuccess, type ApiResponse } from "@/common/utils/api-response.util";
import { AutocompleteQueryDto, PlaceSuggestionDto } from "./dto";
import {
  GEOCODING_AUTOCOMPLETE_THROTTLE_LIMIT,
  GEOCODING_AUTOCOMPLETE_THROTTLE_TTL_MS,
} from "./geocoding.constant";
import type { PlaceSuggestion } from "./geocoding.interface";
import { GEOCODING_ROUTES } from "./geocoding.routes";
import { GeocodingService } from "./geocoding.service";

/**
 * Customer-only address autocomplete endpoints backed by `GeocodingService`.
 */
@ApiTags(GEOCODING_ROUTES.TAG)
@Controller({ path: GEOCODING_ROUTES.BASE, version: "1" })
@ApiAuth(UserRole.CUSTOMER)
@ApiBadRequestResponseRfc9457()
@ApiInternalServerErrorResponseRfc9457()
export class GeocodingController {
  constructor(private readonly geocodingService: GeocodingService) {}

  @Get(GEOCODING_ROUTES.AUTOCOMPLETE)
  @Throttle({
    default: {
      limit: GEOCODING_AUTOCOMPLETE_THROTTLE_LIMIT,
      ttl: GEOCODING_AUTOCOMPLETE_THROTTLE_TTL_MS,
    },
  })
  @ApiOperation({
    summary: "Autocomplete Ho Chi Minh City delivery addresses",
    description:
      "Returns place suggestions (placeId, description, district) for authenticated customers using Goong Place Autocomplete or deterministic mock fixtures.",
  })
  @ApiOkResponseGeneric(PlaceSuggestionDto, { isArray: true })
  @ApiTooManyRequestsResponseRfc9457()
  @ApiRfc9457Response({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    title: "Service Unavailable",
    description: "Geocoding upstream service temporarily unavailable",
    detail: MESSAGES.GEOCODING.UNAVAILABLE,
    typeSlug: ERROR_SLUGS.SERVICE_UNAVAILABLE,
    code: API_ERROR_CODES.GEOCODING_UNAVAILABLE,
  })
  async autocomplete(
    @Query() query: AutocompleteQueryDto,
  ): Promise<ApiResponse<PlaceSuggestion[]>> {
    const suggestions = await this.geocodingService.autocomplete(query.q);
    return apiSuccess(suggestions);
  }
}
