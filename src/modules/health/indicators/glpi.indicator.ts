import { Injectable } from "@nestjs/common";
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from "@nestjs/terminus";
import { GlpiClient } from "../../glpi/glpi.client";

@Injectable()
export class GlpiHealthIndicator extends HealthIndicator {
  constructor(private readonly glpi: GlpiClient) {
    super();
  }

  async isHealthy(key = "glpi"): Promise<HealthIndicatorResult> {
    try {
      const bootstrapAuth = this.glpi.resolveBootstrapAuth();
      if (!bootstrapAuth.userToken && !(bootstrapAuth.login && bootstrapAuth.password)) {
        throw new Error(
          "GLPI bootstrap credentials missing (GLPI_BOOTSTRAP_USER_TOKEN or GLPI_BOOTSTRAP_LOGIN + GLPI_BOOTSTRAP_PASSWORD)",
        );
      }
      await this.glpi.initSession(bootstrapAuth);
      return this.getStatus(key, true);
    } catch (error) {
      const message = (error as Error).message;
      const result = this.getStatus(key, false, { reason: message });
      throw new HealthCheckError(`${key} unavailable`, result);
    }
  }
}
