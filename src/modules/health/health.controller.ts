import { Controller, Get } from "@nestjs/common";
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
} from "@nestjs/terminus";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Public } from "../../common/decorators/public.decorator";
import { GlpiHealthIndicator } from "./indicators/glpi.indicator";
import { SmtpHealthIndicator } from "./indicators/smtp.indicator";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly glpi: GlpiHealthIndicator,
    private readonly smtp: SmtpHealthIndicator,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: "Liveness/readiness check" })
  check() {
    return this.health.check([
      () => this.memory.checkHeap("memory_heap", 256 * 1024 * 1024),
      () => this.memory.checkRSS("memory_rss", 512 * 1024 * 1024),
      () => this.glpi.isHealthy(),
      () => this.smtp.isHealthy(),
    ]);
  }
}
