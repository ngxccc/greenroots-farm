import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "@/common/decorators/public.decorator";
import { apiSuccess } from "@/common/utils/api-response.util";
import { CloudinaryService } from "./cloudinary.service";
import { signedUploadSchema, type SignedUploadInput } from "./media.interface";

@ApiTags("media")
@Controller("media")
export class MediaController {
  constructor(private readonly cloudinaryService: CloudinaryService) {}

  @Public()
  @Post("upload-signature")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Generate Cloudinary signed upload signature (<=5MB image, <=15MB video)",
  })
  getUploadSignature(@Body() body: SignedUploadInput) {
    const validated = signedUploadSchema.parse(body);
    const signatureData =
      this.cloudinaryService.createUploadSignature(validated);
    return apiSuccess(signatureData);
  }
}
