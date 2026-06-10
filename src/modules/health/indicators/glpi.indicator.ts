/**
 * @file glpi.indicator.ts
 * @description Indicador de salud Terminus que valida sesión bootstrap contra GLPI.
 */
import { Injectable } from "@nestjs/common";
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from "@nestjs/terminus";
import { GlpiClient } from "../../glpi/glpi.client";

/**
 * Comprueba credenciales bootstrap e inicialización de sesión GLPI.
 */
@Injectable()
export class GlpiHealthIndicator extends HealthIndicator {
  /** Inyecta el cliente HTTP de GLPI. */
  constructor(private readonly glpi: GlpiClient) {
    super();
  }

  /**
   * Intenta abrir sesión GLPI con las credenciales bootstrap configuradas.
   * @param key - Clave del indicador en el reporte de salud.
   * @returns Resultado Terminus con estado up si la sesión se inicia.
   * @throws {HealthCheckError} Si faltan credenciales o GLPI no responde.
   */
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
