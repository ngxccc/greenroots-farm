import { Controller, Get } from "@nestjs/common";
import { Public } from "@/common/decorators/public.decorator";
import { MESSAGES } from "@/common/constants/messages.constant";
import { apiSuccess } from "@/common/utils/api-response.util";

@Controller()
export class AppController {
  @Public()
  @Get("health")
  health() {
    return apiSuccess({
      status: "ok",
      message: MESSAGES.COMMON.HEALTHY,
      timestamp: new Date().toISOString(),
    });
  }
}
