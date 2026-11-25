import { Body, Controller, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@greenroots/shared";
import { ERROR_SLUGS, MESSAGES } from "@/common/constants/messages.constant";
import {
  ApiAuth,
  ApiBadRequestResponseRfc9457,
  ApiConflictResponseRfc9457,
  ApiCreatedResponseGeneric,
  ApiInternalServerErrorResponseRfc9457,
  ApiNotFoundResponseRfc9457,
  ApiRfc9457Response,
  ApiTooManyRequestsResponseRfc9457,
  ApiUnprocessableEntityResponseRfc9457,
  CurrentUser,
} from "@/common/decorators";
import { ZodValidationPipe } from "@/common/pipes/zod-validation.pipe";
import { zUuidV7 } from "@/common/schemas/zod-primitives";
import { apiSuccess, type ApiResponse } from "@/common/utils/api-response.util";
import { COMPLAINTS_ROUTES } from "./complaints.routes";
import { ComplaintsService } from "./complaints.service";
import {
  ComplaintDto,
  CreateComplaintDto,
  type ComplaintProjection,
} from "./dto";

/**
 * Customer post-delivery complaint submission endpoint (`/api/v1/orders/:id/complaints`).
 */
@ApiTags(COMPLAINTS_ROUTES.TAG)
@Controller({ path: COMPLAINTS_ROUTES.ORDERS_BASE, version: "1" })
@ApiBadRequestResponseRfc9457()
@ApiInternalServerErrorResponseRfc9457()
export class ComplaintsController {
  constructor(private readonly complaintsService: ComplaintsService) {}

  @Post(COMPLAINTS_ROUTES.SUBMIT)
  @ApiAuth(UserRole.CUSTOMER)
  @ApiOperation({
    summary: "Submit a 24-hour post-delivery order complaint",
    description:
      "Creates a pending complaint for an owned delivered or completed order within 24 hours of delivery, backed by 1-5 Cloudinary proof images and an optional video verified server-side.",
  })
  @ApiParam({
    name: "id",
    type: "string",
    format: "uuid",
    description: "Order UUIDv7 identifier",
  })
  @ApiCreatedResponseGeneric(ComplaintDto)
  @ApiNotFoundResponseRfc9457()
  @ApiConflictResponseRfc9457()
  @ApiUnprocessableEntityResponseRfc9457()
  @ApiTooManyRequestsResponseRfc9457()
  @ApiRfc9457Response({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: "Media verification service unavailable (Service Unavailable)",
    title: "Service Unavailable",
    detail: MESSAGES.COMPLAINTS.MEDIA_SERVICE_UNAVAILABLE,
    typeSlug: ERROR_SLUGS.SERVICE_UNAVAILABLE,
  })
  async submitComplaint(
    @CurrentUser("sub") userId: string,
    @Param("id", new ZodValidationPipe(zUuidV7())) orderId: string,
    @Body() dto: CreateComplaintDto,
  ): Promise<ApiResponse<ComplaintProjection>> {
    const complaint = await this.complaintsService.submitComplaint(
      userId,
      orderId,
      dto,
    );
    return apiSuccess(complaint);
  }
}
