/**
 * @file postgres.health.indicator.ts
 * @description Indicador de salud Terminus para PostgreSQL cuando está configurado.
 */
import { Injectable } from "@nestjs/common";
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from "@nestjs/terminus";
import { ConfigService } from "@nestjs/config";
import type { AppConfig } from "../../config/configuration";
import { PostgresService } from "./postgres.service";

/**
 * Comprueba disponibilidad de PostgreSQL si hay configuración de conexión.
 */
@Injectable()
export class PostgresHealthIndicator extends HealthIndicator {
  /** Inyecta servicio PostgreSQL y configuración de conexión. */
  constructor(
    private readonly postgres: PostgresService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {
    super();
  }

  /**
   * Evalúa si PostgreSQL está habilitado, configurado y responde al ping.
   * @param key - Clave del indicador en el reporte de salud.
   * @returns Resultado Terminus con estado up/down.
   * @throws {HealthCheckError} Si está configurado pero no responde.
   */
  async isHealthy(key = "postgres"): Promise<HealthIndicatorResult> {
    const hasConfig =
      Boolean(this.config.get("postgres.host", { infer: true })) &&
      Boolean(this.config.get("postgres.database", { infer: true })) &&
      Boolean(this.config.get("postgres.user", { infer: true }));
    if (!hasConfig) {
      return this.getStatus(key, true, { enabled: false });
    }

    try {
      await this.postgres.ping();
      return this.getStatus(key, true);
    } catch (error) {
      const result = this.getStatus(key, false, {
        reason: (error as Error).message,
      });
      throw new HealthCheckError(`${key} unavailable`, result);
    }
  }
}
