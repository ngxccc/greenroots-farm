import {
  Body,
  Controller,
  Get,
  InternalServerErrorException,
  Post,
} from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { randomUUID } from "node:crypto";
import { Public } from "@/common/decorators/public.decorator";
import { Idempotent } from "@/common/decorators/idempotent.decorator";
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

  @Public()
  @Post("test/idempotent-mutation")
  @Idempotent({ required: true })
  @ApiOperation({
    summary: "Test endpoint for idempotency chaos and failure injection",
  })
  async testMutation(@Body() body: Record<string, unknown>) {
    const delayMs = typeof body["delayMs"] === "number" ? body["delayMs"] : 0;
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    if (body["simulateError"] === true) {
      throw new InternalServerErrorException(
        "Mô phỏng lỗi giao dịch để kiểm tra giải phóng khóa Idempotency",
      );
    }

    return apiSuccess({
      status: "processed",
      echo: body,
      executionId: randomUUID(),
      processedAt: new Date().toISOString(),
    });
  }
}
