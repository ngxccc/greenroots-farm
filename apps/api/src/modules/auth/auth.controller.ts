import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import {
  ApiAuth,
  ApiBadRequestResponseRfc9457,
  ApiConflictResponseRfc9457,
  ApiCreatedResponseGeneric,
  ApiForbiddenResponseRfc9457,
  ApiInternalServerErrorResponseRfc9457,
  ApiOkResponseGeneric,
  ApiUnauthorizedResponseRfc9457,
  CurrentUser,
  Public,
} from "@/common/decorators";
import { apiSuccess, type ApiResponse } from "@/common/utils/api-response.util";
import { extractClientMetadata } from "@/common/utils/client-info.util";
import { AUTH_ROUTES } from "./auth.routes";
import { AuthService } from "./auth.service";
import {
  ForgotPasswordDto,
  LoginDto,
  LoginResponseDto,
  RefreshResponseDto,
  RefreshTokenDto,
  RegisterDto,
  ResendVerificationDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from "./dto";

@Controller({ path: AUTH_ROUTES.BASE, version: "1" })
@ApiTags(AUTH_ROUTES.TAG)
@ApiBadRequestResponseRfc9457()
@ApiInternalServerErrorResponseRfc9457()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post(AUTH_ROUTES.REGISTER)
  @ApiOperation({
    summary: "Register new customer account",
    description:
      "Creates an unverified account and enqueues an email verification link.",
  })
  @ApiCreatedResponseGeneric()
  @ApiConflictResponseRfc9457()
  async register(@Body() dto: RegisterDto): Promise<ApiResponse<null>> {
    await this.authService.register(dto);
    return apiSuccess(null);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post(AUTH_ROUTES.VERIFY_EMAIL)
  @ApiOperation({
    summary: "Verify account email",
    description:
      "Validates a 64-character verification token and activates the customer account.",
  })
  @ApiOkResponseGeneric()
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<ApiResponse<null>> {
    await this.authService.verifyEmail(dto.token);
    return apiSuccess(null);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post(AUTH_ROUTES.RESEND_VERIFICATION)
  @Throttle({
    auth: { limit: 3, ttl: 60000 },
  })
  @ApiOperation({
    summary: "Resend email verification link",
    description:
      "Issues a fresh verification token and dispatches an activation email subject to cooldown.",
  })
  @ApiOkResponseGeneric()
  async resendVerification(
    @Body() dto: ResendVerificationDto,
  ): Promise<ApiResponse<null>> {
    await this.authService.resendVerificationEmail(dto);
    return apiSuccess(null);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post(AUTH_ROUTES.LOGIN)
  @Throttle({
    auth: { limit: 5, ttl: 60000 },
  })
  @ApiOperation({
    summary: "Authenticate credentials and issue session tokens",
    description:
      "Verifies credentials and returns a short-lived access token and refresh token.",
  })
  @ApiOkResponseGeneric(LoginResponseDto)
  @ApiUnauthorizedResponseRfc9457()
  @ApiForbiddenResponseRfc9457()
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
  ): Promise<ApiResponse<LoginResponseDto>> {
    const metadata = extractClientMetadata(req);
    const result = await this.authService.login(dto, metadata);
    return apiSuccess(result);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post(AUTH_ROUTES.REFRESH)
  @Throttle({
    auth: { limit: 10, ttl: 60000 },
  })
  @ApiOperation({
    summary: "Rotate refresh token and issue renewed session",
    description:
      "Validates single-use refresh token, atomically deletes it, and issues a new pair.",
  })
  @ApiOkResponseGeneric(RefreshResponseDto)
  @ApiUnauthorizedResponseRfc9457()
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
  ): Promise<ApiResponse<RefreshResponseDto>> {
    const metadata = extractClientMetadata(req);
    const result = await this.authService.refreshToken(dto, metadata);
    return apiSuccess(result);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post(AUTH_ROUTES.LOGOUT)
  @ApiOperation({
    summary: "Revoke single device session",
    description:
      "Revokes the provided refresh token and blacklists the caller access token in Redis.",
  })
  @ApiOkResponseGeneric()
  @ApiUnauthorizedResponseRfc9457()
  async logout(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
  ): Promise<ApiResponse<null>> {
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;

    await this.authService.logout(dto.refreshToken, accessToken);
    return apiSuccess(null);
  }

  @ApiAuth()
  @HttpCode(HttpStatus.OK)
  @Post(AUTH_ROUTES.LOGOUT_ALL)
  @Throttle({
    auth: { limit: 2, ttl: 60000 },
  })
  @ApiOperation({
    summary: "Revoke all user sessions globally",
    description:
      "Purges all active refresh tokens and blacklists the user across all devices in Redis.",
  })
  @ApiOkResponseGeneric()
  async logoutAll(
    @CurrentUser("sub") userId: string,
  ): Promise<ApiResponse<null>> {
    await this.authService.logoutAll(userId);
    return apiSuccess(null);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post(AUTH_ROUTES.FORGOT_PASSWORD)
  @Throttle({
    auth: { limit: 3, ttl: 60000 },
  })
  @ApiOperation({
    summary: "Request password recovery email",
    description:
      "Generates a 15-minute recovery token and enqueues password reset instructions.",
  })
  @ApiOkResponseGeneric()
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<ApiResponse<null>> {
    await this.authService.forgotPassword(dto);
    return apiSuccess(null);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post(AUTH_ROUTES.RESET_PASSWORD)
  @Throttle({
    auth: { limit: 5, ttl: 60000 },
  })
  @ApiOperation({
    summary: "Reset account password",
    description:
      "Updates password with valid token and invalidates all existing sessions.",
  })
  @ApiOkResponseGeneric()
  @ApiForbiddenResponseRfc9457()
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<ApiResponse<null>> {
    await this.authService.resetPassword(dto);
    return apiSuccess(null);
  }
}
