/**
 * @file smtp.indicator.ts
 * @description Indicador de salud Terminus para verificación SMTP del servicio de correo.
 */
import { Injectable } from "@nestjs/common";
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from "@nestjs/terminus";
import { MailService } from "../../mail/mail.service";

/**
 * Comprueba conectividad SMTP cuando el envío de correo está habilitado.
 */
@Injectable()
export class SmtpHealthIndicator extends HealthIndicator {
  /** Inyecta el servicio de correo para verificar SMTP. */
  constructor(private readonly mail: MailService) {
    super();
  }

  /**
   * Evalúa si SMTP está habilitado y responde a la verificación del transporte.
   * @param key - Clave del indicador en el reporte de salud.
   * @returns Resultado Terminus con estado up/down.
   * @throws {HealthCheckError} Si SMTP está habilitado pero la verificación falla.
   */
  async isHealthy(key = "smtp"): Promise<HealthIndicatorResult> {
    if (!this.mail.isEnabled()) {
      return this.getStatus(key, true, { enabled: false });
    }
    const ok = await this.mail.verify();
    const result = this.getStatus(key, ok, { enabled: true });
    if (!ok) {
      throw new HealthCheckError(`${key} unavailable`, result);
    }
    return result;
  }
}
