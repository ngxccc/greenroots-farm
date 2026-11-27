import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { API_ERROR_CODES, AuthSurface, UserRole } from "@greenroots/shared";
import { resolveAllowedOrigins } from "@/common/config/cors.config";
import { env } from "@/common/config/env.config";
import { MESSAGES } from "@/common/constants/messages.constant";
import {
  ApiAuth,
  ApiBadRequestResponseRfc9457,
  ApiConflictResponseRfc9457,
  ApiCreatedResponseGeneric,
  ApiForbiddenResponseRfc9457,
  ApiInternalServerErrorResponseRfc9457,
  ApiOkResponseGeneric,
  ApiTooManyRequestsResponseRfc9457,
  ApiUnauthorizedResponseRfc9457,
  CurrentUser,
  Public,
  type JwtPayload,
} from "@/common/decorators";
import { apiSuccess, type ApiResponse } from "@/common/utils/api-response.util";
import { extractClientMetadata } from "@/common/utils/client-info.util";
import {
  STAFF_REFRESH_COOKIE,
  STAFF_REFRESH_COOKIE_MAX_AGE_MS,
  STAFF_REFRESH_COOKIE_PATH,
} from "./auth.constant";
import { AUTH_ROUTES } from "./auth.routes";
import { AuthService } from "./auth.service";
import {
  ActiveSessionDto,
  ForgotPasswordDto,
  LoginDto,
  LoginResponseDto,
  LogoutDto,
  RefreshResponseDto,
  RefreshTokenDto,
  RegisterDto,
  ResendVerificationDto,
  ResetPasswordDto,
  StaffAuthResponseDto,
  VerifyEmailDto,
} from "./dto";

@Controller({ path: AUTH_ROUTES.BASE, version: "1" })
@ApiTags(AUTH_ROUTES.TAG)
@ApiBadRequestResponseRfc9457()
@ApiInternalServerErrorResponseRfc9457()
export class AuthController {
  private readonly allowedOrigins = resolveAllowedOrigins(env.CORS_ORIGINS);

  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post(AUTH_ROUTES.REGISTER)
  @Throttle({
    default: { limit: 5, ttl: 60000 },
  })
  @ApiOperation({
    summary: "Register new customer account",
    description:
      "Creates an unverified account and enqueues an email verification link.",
  })
  @ApiCreatedResponseGeneric()
  @ApiConflictResponseRfc9457()
  @ApiTooManyRequestsResponseRfc9457()
  async register(@Body() dto: RegisterDto): Promise<ApiResponse<null>> {
    await this.authService.register(dto);
    return apiSuccess(null);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post(AUTH_ROUTES.VERIFY_EMAIL)
  @Throttle({
    default: { limit: 10, ttl: 60000 },
  })
  @ApiOperation({
    summary: "Verify account email",
    description:
      "Validates a 64-character verification token and activates the customer account.",
  })
  @ApiOkResponseGeneric()
  @ApiTooManyRequestsResponseRfc9457()
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<ApiResponse<null>> {
    await this.authService.verifyEmail(dto.token);
    return apiSuccess(null);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post(AUTH_ROUTES.RESEND_VERIFICATION)
  @Throttle({
    default: { limit: 3, ttl: 60000 },
  })
  @ApiOperation({
    summary: "Resend email verification link",
    description:
      "Issues a fresh verification token and dispatches an activation email subject to cooldown.",
  })
  @ApiOkResponseGeneric()
  @ApiTooManyRequestsResponseRfc9457()
  async resendVerification(
    @Body() dto: ResendVerificationDto,
  ): Promise<ApiResponse<null>> {
    await this.authService.resendVerificationEmail(dto);
    return apiSuccess(null);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post(AUTH_ROUTES.CUSTOMER_LOGIN)
  @Throttle({
    default: { limit: 5, ttl: 60000 },
  })
  @ApiOperation({
    summary: "Authenticate customer credentials and issue session tokens",
    description:
      "Verifies customer credentials and returns a short-lived access token and customer-bound refresh token.",
  })
  @ApiOkResponseGeneric(LoginResponseDto)
  @ApiUnauthorizedResponseRfc9457()
  @ApiForbiddenResponseRfc9457()
  @ApiTooManyRequestsResponseRfc9457()
  async customerLogin(
    @Body() dto: LoginDto,
    @Req() req: Request,
  ): Promise<ApiResponse<LoginResponseDto>> {
    const metadata = extractClientMetadata(req);
    const result = await this.authService.login(
      dto,
      AuthSurface.CUSTOMER,
      metadata,
    );
    return apiSuccess(result);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post(AUTH_ROUTES.STAFF_LOGIN)
  @Throttle({
    default: { limit: 5, ttl: 60000 },
  })
  @ApiOperation({
    summary: "Authenticate internal staff credentials and issue session tokens",
    description:
      "Verifies internal staff credentials, sets an HttpOnly staff refresh cookie, and returns an access token and staff user profile.",
  })
  @ApiOkResponseGeneric(StaffAuthResponseDto)
  @ApiUnauthorizedResponseRfc9457()
  @ApiForbiddenResponseRfc9457()
  @ApiTooManyRequestsResponseRfc9457()
  async staffLogin(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<StaffAuthResponseDto>> {
    const metadata = extractClientMetadata(req);
    const result = await this.authService.login(
      dto,
      AuthSurface.STAFF,
      metadata,
    );
    return this.issueStaffAuthResponse(res, result);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post(AUTH_ROUTES.CUSTOMER_REFRESH)
  @Throttle({
    default: { limit: 10, ttl: 60000 },
  })
  @ApiOperation({
    summary: "Rotate customer refresh token and issue renewed session",
    description:
      "Validates single-use customer refresh token, atomically deletes it, and issues a new pair.",
  })
  @ApiOkResponseGeneric(RefreshResponseDto)
  @ApiUnauthorizedResponseRfc9457()
  @ApiForbiddenResponseRfc9457()
  @ApiTooManyRequestsResponseRfc9457()
  async customerRefresh(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
  ): Promise<ApiResponse<RefreshResponseDto>> {
    const metadata = extractClientMetadata(req);
    const result = await this.authService.refreshToken(
      dto,
      AuthSurface.CUSTOMER,
      metadata,
    );
    return apiSuccess({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post(AUTH_ROUTES.STAFF_REFRESH)
  @Throttle({
    default: { limit: 10, ttl: 60000 },
  })
  @ApiOperation({
    summary: "Rotate staff refresh cookie and issue renewed session",
    description:
      "Validates the HttpOnly staff refresh cookie, atomically rotates it, and returns a new access token and staff user profile.",
  })
  @ApiOkResponseGeneric(StaffAuthResponseDto)
  @ApiUnauthorizedResponseRfc9457()
  @ApiForbiddenResponseRfc9457()
  @ApiTooManyRequestsResponseRfc9457()
  async staffRefresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<StaffAuthResponseDto>> {
    this.assertAllowedOrigin(req);
    const cookieToken = this.readStaffRefreshCookie(req);
    if (!cookieToken) {
      this.clearStaffRefreshCookie(res);
      throw new UnauthorizedException({
        code: API_ERROR_CODES.AUTH_TOKEN_INVALID_OR_EXPIRED,
        detail: MESSAGES.AUTH.TOKEN_INVALID_OR_EXPIRED,
      });
    }

    const metadata = extractClientMetadata(req);
    try {
      const result = await this.authService.refreshToken(
        { refreshToken: cookieToken },
        AuthSurface.STAFF,
        metadata,
      );
      return this.issueStaffAuthResponse(res, result);
    } catch (error) {
      this.clearStaffRefreshCookie(res);
      throw error;
    }
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post(AUTH_ROUTES.LOGOUT)
  @Throttle({
    default: { limit: 10, ttl: 60000 },
  })
  @ApiOperation({
    summary: "Revoke single device session",
    description:
      "Revokes the provided refresh token or HttpOnly staff refresh cookie and blacklists the caller access token in Redis.",
  })
  @ApiOkResponseGeneric()
  @ApiForbiddenResponseRfc9457()
  @ApiTooManyRequestsResponseRfc9457()
  async logout(
    @Body() dto: LogoutDto | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiResponse<null>> {
    const cookieToken = this.readStaffRefreshCookie(req);
    if (!dto?.refreshToken && cookieToken) {
      this.assertAllowedOrigin(req);
    }

    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : undefined;

    await this.authService.logout(
      dto?.refreshToken ?? cookieToken,
      accessToken,
    );
    this.clearStaffRefreshCookie(res);
    return apiSuccess(null);
  }

  @ApiAuth(UserRole.CUSTOMER)
  @Get(AUTH_ROUTES.CUSTOMER_SESSIONS)
  @Throttle({
    default: { limit: 20, ttl: 60000 },
  })
  @ApiOperation({
    summary: "List active customer sessions",
    description:
      "Returns a bounded closed projection of non-expired customer refresh sessions, flagging the caller's current session.",
  })
  @ApiOkResponseGeneric(ActiveSessionDto, { isArray: true })
  @ApiTooManyRequestsResponseRfc9457()
  async listCustomerSessions(
    @CurrentUser() user: JwtPayload,
  ): Promise<ApiResponse<ActiveSessionDto[]>> {
    const sessions = await this.authService.listCustomerSessions(
      user.sub,
      user.sid,
    );
    return apiSuccess(sessions);
  }

  @ApiAuth()
  @HttpCode(HttpStatus.OK)
  @Post(AUTH_ROUTES.LOGOUT_ALL)
  @Throttle({
    default: { limit: 2, ttl: 60000 },
  })
  @ApiOperation({
    summary: "Revoke all user sessions globally",
    description:
      "Purges all active refresh tokens and blacklists the user across all devices in Redis.",
  })
  @ApiOkResponseGeneric()
  @ApiTooManyRequestsResponseRfc9457()
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
    default: { limit: 3, ttl: 60000 },
  })
  @ApiOperation({
    summary: "Request password recovery email",
    description:
      "Generates a 15-minute recovery token and enqueues password reset instructions.",
  })
  @ApiOkResponseGeneric()
  @ApiTooManyRequestsResponseRfc9457()
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
    default: { limit: 5, ttl: 60000 },
  })
  @ApiOperation({
    summary: "Reset account password",
    description:
      "Updates password with valid token and invalidates all existing sessions.",
  })
  @ApiOkResponseGeneric()
  @ApiForbiddenResponseRfc9457()
  @ApiTooManyRequestsResponseRfc9457()
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<ApiResponse<null>> {
    await this.authService.resetPassword(dto);
    return apiSuccess(null);
  }

  private readStaffRefreshCookie(req: Request): string | undefined {
    const cookies = req.cookies as Record<string, unknown> | undefined;
    const raw = cookies?.[STAFF_REFRESH_COOKIE];
    return typeof raw === "string" && raw.trim().length > 0 ? raw : undefined;
  }

  private setStaffRefreshCookie(res: Response, refreshToken: string): void {
    res.cookie(STAFF_REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      path: STAFF_REFRESH_COOKIE_PATH,
      maxAge: STAFF_REFRESH_COOKIE_MAX_AGE_MS,
    });
  }

  private clearStaffRefreshCookie(res: Response): void {
    res.clearCookie(STAFF_REFRESH_COOKIE, {
      httpOnly: true,
      sameSite: "lax",
      secure: env.NODE_ENV === "production",
      path: STAFF_REFRESH_COOKIE_PATH,
    });
  }

  private issueStaffAuthResponse(
    res: Response,
    result: LoginResponseDto,
  ): ApiResponse<StaffAuthResponseDto> {
    this.setStaffRefreshCookie(res, result.refreshToken);
    return apiSuccess({
      accessToken: result.accessToken,
      user: result.user,
    });
  }

  private assertAllowedOrigin(req: Request): void {
    const origin = req.headers.origin;
    if (!origin) return;
    if (!this.allowedOrigins.includes(origin)) {
      throw new ForbiddenException({
        code: API_ERROR_CODES.AUTH_SURFACE_FORBIDDEN,
        detail: MESSAGES.AUTH.SURFACE_FORBIDDEN,
      });
    }
  }
}
