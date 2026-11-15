import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "@/common/decorators/public.decorator";
import { MESSAGES } from "@/common/constants/messages.constant";
import { apiSuccess } from "@/common/utils/api-response.util";
@ApiTags("health")
@Controller()
export class AppController {
  @Public()
  @Get("health")
  @ApiOperation({ summary: "System health check" })
  @ApiOkResponse({
    description: "System health status",
    schema: {
      type: "object",
      properties: {
        success: { type: "boolean", example: true },
        data: {
          type: "object",
          properties: {
            status: { type: "string", example: "ok" },
            message: { type: "string", example: MESSAGES.COMMON.HEALTHY },
            timestamp: { type: "string", example: "2026-11-14T00:00:00.000Z" },
          },
          required: ["status", "message", "timestamp"],
        },
      },
      required: ["success", "data"],
    },
  })
  health() {
    return apiSuccess({
      status: "ok",
      message: MESSAGES.COMMON.HEALTHY,
      timestamp: new Date().toISOString(),
    });
  }
}
