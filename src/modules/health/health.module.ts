import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { HealthController } from "./health.controller";
import { GlpiHealthIndicator } from "./indicators/glpi.indicator";
import { SmtpHealthIndicator } from "./indicators/smtp.indicator";

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [GlpiHealthIndicator, SmtpHealthIndicator],
})
export class HealthModule {}
