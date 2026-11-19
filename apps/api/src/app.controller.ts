import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  ApiInternalServerErrorResponseRfc9457,
  ApiOkResponseGeneric,
} from "@/common/decorators";
import { Public } from "@/common/decorators/public.decorator";
import { HealthResponseDto, type HealthResponse } from "@/common/dto";
import { MESSAGES } from "@/common/constants/messages.constant";
import { apiSuccess, type ApiResponse } from "@/common/utils/api-response.util";

@ApiTags("health")
@Controller({ version: "1" })
@ApiInternalServerErrorResponseRfc9457()
export class AppController {
  @Public()
  @Get("health")
  @ApiOperation({ summary: "System health check" })
  @ApiOkResponseGeneric(HealthResponseDto)
  health(): ApiResponse<HealthResponse> {
    return apiSuccess({
      status: "ok" as const,
      message: MESSAGES.COMMON.HEALTHY,
      timestamp: new Date().toISOString(),
    });
  }
}
