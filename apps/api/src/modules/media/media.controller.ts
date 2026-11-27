import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from "@nestjs/common";
import { ApiNoContentResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  ApiAuth,
  ApiBadRequestResponseRfc9457,
  ApiConflictResponseRfc9457,
  ApiForbiddenResponseRfc9457,
  ApiInternalServerErrorResponseRfc9457,
  ApiOkResponseGeneric,
  ApiUnprocessableEntityResponseRfc9457,
  CurrentUser,
  type JwtPayload,
} from "@/common/decorators";
import { apiSuccess, type ApiResponse } from "@/common/utils/api-response.util";
import { CloudinaryService } from "./cloudinary.service";
import {
  DeleteComplaintMediaQueryDto,
  SignedUploadDto,
  SignedUploadResponseDto,
  type SignedUploadResponse,
} from "./dto";
import { MEDIA_ROUTES } from "./media.routes";

@ApiTags(MEDIA_ROUTES.TAG)
@Controller({ path: MEDIA_ROUTES.BASE, version: "1" })
@ApiBadRequestResponseRfc9457()
@ApiInternalServerErrorResponseRfc9457()
export class MediaController {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  @ApiAuth()
  @Post(MEDIA_ROUTES.UPLOAD_SIGNATURE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Generate Cloudinary signed upload signature (<=5MB image, <=15MB video)",
    description:
      "Generates an HMAC SHA-256 signature and upload parameters for client-side direct asset uploads to Cloudinary without streaming files through API memory.",
  })
  @ApiOkResponseGeneric(SignedUploadResponseDto)
  @ApiForbiddenResponseRfc9457()
  @ApiUnprocessableEntityResponseRfc9457()
  getUploadSignature(
    @Body() dto: SignedUploadDto,
    @CurrentUser() user: JwtPayload,
  ): ApiResponse<SignedUploadResponse> {
    const signatureData = this.cloudinaryService.createUploadSignature(
      dto,
      user.role,
      user.sub,
    );
    return apiSuccess(signatureData);
  }

  @ApiAuth()
  @Delete(MEDIA_ROUTES.COMPLAINTS)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Delete an unsubmitted complaint media asset from Cloudinary",
    description:
      "Deletes an uploaded complaint image or video owned by the authenticated user when not yet linked to a persisted complaint.",
  })
  @ApiNoContentResponse({
    description: "Unsubmitted complaint media deleted from Cloudinary",
  })
  @ApiForbiddenResponseRfc9457()
  @ApiConflictResponseRfc9457()
  async deleteComplaintMedia(
    @Query() query: DeleteComplaintMediaQueryDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<void> {
    await this.cloudinaryService.deleteComplaintMedia(query, user.sub);
  }
}
