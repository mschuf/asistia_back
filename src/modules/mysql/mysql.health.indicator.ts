import { Injectable } from "@nestjs/common";
import {
  HealthCheckError,
  HealthIndicator,
  HealthIndicatorResult,
} from "@nestjs/terminus";
import { ConfigService } from "@nestjs/config";
import type { AppConfig } from "../../config/configuration";
import { MysqlService } from "./mysql.service";

@Injectable()
export class MysqlHealthIndicator extends HealthIndicator {
  constructor(
    private readonly mysql: MysqlService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {
    super();
  }

  async isHealthy(key = "mysql"): Promise<HealthIndicatorResult> {
    const historySql = this.config.get("glpi.historySource", { infer: true }) === "sql";
    const metricsSql = this.config.get("glpi.metricsSource", { infer: true }) === "sql";
    if (!historySql && !metricsSql) {
      return this.getStatus(key, true, { enabled: false });
    }

    const hasConfig =
      Boolean(this.config.get("mysql.host", { infer: true })) &&
      Boolean(this.config.get("mysql.database", { infer: true })) &&
      Boolean(this.config.get("mysql.user", { infer: true }));
    if (!hasConfig) {
      const result = this.getStatus(key, false, {
        reason:
          "MYSQL_HOST/MYSQL_DATABASE/MYSQL_USER are required when GLPI_HISTORY_SOURCE=sql or GLPI_METRICS_SOURCE=sql",
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
