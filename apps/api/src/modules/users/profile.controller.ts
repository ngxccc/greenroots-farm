import { Body, Controller, Get, Patch } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  ApiAuth,
  ApiBadRequestResponseRfc9457,
  ApiInternalServerErrorResponseRfc9457,
  ApiOkResponseGeneric,
  CurrentUser,
} from "@/common/decorators";
import { apiSuccess, type ApiResponse } from "@/common/utils/api-response.util";
import {
  UpdateProfileDto,
  type UpdateProfileInput,
  UserProfileDto,
  type UserProfile,
} from "./dto";
import { ProfileService } from "./profile.service";
import { USERS_ROUTES } from "./users.routes";

@ApiTags(USERS_ROUTES.TAG)
@Controller({ path: USERS_ROUTES.BASE, version: "1" })
@ApiAuth()
@ApiInternalServerErrorResponseRfc9457()
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get(USERS_ROUTES.ME)
  @ApiOperation({
    summary: "Get current user profile",
    description:
      "Returns the authenticated subject's self-service profile projection.",
  })
  @ApiOkResponseGeneric(UserProfileDto)
  async getMe(
    @CurrentUser("sub") userId: string,
  ): Promise<ApiResponse<UserProfile>> {
    const profile = await this.profileService.getProfile(userId);
    return apiSuccess(profile);
  }

  @Patch(USERS_ROUTES.ME)
  @ApiOperation({
    summary: "Update current user profile",
    description:
      "Updates the authenticated subject's fullName and/or phone and returns the updated profile.",
  })
  @ApiOkResponseGeneric(UserProfileDto)
  @ApiBadRequestResponseRfc9457()
  async updateMe(
    @CurrentUser("sub") userId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<ApiResponse<UserProfile>> {
    // ZodValidationPipe guarantees at least one field via updateProfileSchema.refine().
    const profile = await this.profileService.updateProfile(
      userId,
      dto as UpdateProfileInput,
    );
    return apiSuccess(profile);
  }
}
