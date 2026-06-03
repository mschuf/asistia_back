import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { MysqlModule } from "../mysql/mysql.module";
import { PostgresModule } from "../postgres/postgres.module";
import { HealthController } from "./health.controller";
import { GlpiHealthIndicator } from "./indicators/glpi.indicator";
import { SmtpHealthIndicator } from "./indicators/smtp.indicator";
import { MysqlHealthIndicator } from "../mysql/mysql.health.indicator";
import { PostgresHealthIndicator } from "../postgres/postgres.health.indicator";

@Module({
  imports: [TerminusModule, MysqlModule, PostgresModule],
  controllers: [HealthController],
  providers: [
    GlpiHealthIndicator,
    SmtpHealthIndicator,
    MysqlHealthIndicator,
    PostgresHealthIndicator,
  ],
})
export class HealthModule {}
