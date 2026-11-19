import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  ApiAuth,
  ApiBadRequestResponseRfc9457,
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
    );
    return apiSuccess(signatureData);
  }
}
