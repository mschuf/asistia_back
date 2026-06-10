/**
 * @file mysql.health.indicator.ts
 * @description Indicador de salud Terminus para MySQL cuando GLPI usa fuentes SQL.
 */
import { Injectable } from "@nestjs/common";
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from "@nestjs/terminus";
import { ConfigService } from "@nestjs/config";
import type { AppConfig } from "../../config/configuration";
import { MysqlService } from "./mysql.service";

/**
 * Comprueba disponibilidad de MySQL según las fuentes GLPI configuradas en SQL.
 */
@Injectable()
export class MysqlHealthIndicator extends HealthIndicator {
  /** Inyecta servicio MySQL y configuración de fuentes GLPI. */
  constructor(
    private readonly mysql: MysqlService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {
    super();
  }

  /**
   * Evalúa si MySQL está habilitado, configurado y responde al ping.
   * @param key - Clave del indicador en el reporte de salud.
   * @returns Resultado Terminus con estado up/down.
   * @throws {HealthCheckError} Si se requiere MySQL y no está disponible o configurado.
   */
  async isHealthy(key = "mysql"): Promise<HealthIndicatorResult> {
    const historySql = this.config.get("glpi.historySource", { infer: true }) === "sql";
    const metricsSql = this.config.get("glpi.metricsSource", { infer: true }) === "sql";
    const statusSql = this.config.get("glpi.statusSource", { infer: true }) === "sql";
    if (!historySql && !metricsSql && !statusSql) {
      return this.getStatus(key, true, { enabled: false });
    }

    const hasConfig =
      Boolean(this.config.get("mysql.host", { infer: true })) &&
      Boolean(this.config.get("mysql.database", { infer: true })) &&
      Boolean(this.config.get("mysql.user", { infer: true }));
    if (!hasConfig) {
      const result = this.getStatus(key, false, {
        reason:
          "MYSQL_HOST/MYSQL_DATABASE/MYSQL_USER are required when GLPI_HISTORY_SOURCE, GLPI_METRICS_SOURCE or GLPI_STATUS_SOURCE is sql",
      });
      throw new HealthCheckError(`${key} unavailable`, result);
    }

    try {
      await this.mysql.ping();
      return this.getStatus(key, true);
    } catch (error) {
      const result = this.getStatus(key, false, {
        reason: (error as Error).message,
      });
      throw new HealthCheckError(`${key} unavailable`, result);
    }
  }
}
