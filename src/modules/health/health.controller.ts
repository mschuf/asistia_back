/**
 * @file health.controller.ts
 * @description Endpoint público de liveness/readiness con indicadores de dependencias.
 */
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
import { MysqlHealthIndicator } from "../mysql/mysql.health.indicator";
import { PostgresHealthIndicator } from "../postgres/postgres.health.indicator";

/**
 * Controlador HTTP de salud agregando memoria, GLPI, SMTP, MySQL y PostgreSQL.
 */
@ApiTags("health")
@Controller("health")
export class HealthController {
  /** Inyecta servicio Terminus e indicadores de dependencias. */
  constructor(
    private readonly health: HealthCheckService,
    private readonly memory: MemoryHealthIndicator,
    private readonly glpi: GlpiHealthIndicator,
    private readonly smtp: SmtpHealthIndicator,
    private readonly mysql: MysqlHealthIndicator,
    private readonly postgres: PostgresHealthIndicator,
  ) {}

  /**
   * Ejecuta el chequeo agregado de salud de la API y sus dependencias.
   * @returns Resultado Terminus con estado de cada indicador.
   */
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
      () => this.mysql.isHealthy(),
      () => this.postgres.isHealthy(),
    ]);
  }
}
