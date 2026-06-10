/**
 * @file mail.service.ts
 * @description Envía correos vía SMTP con reintentos, verificación de conexión y enriquecimiento de errores.
 */
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer, { Transporter } from "nodemailer";
import type { AppConfig } from "../../config/configuration";
import type { MailRecipient } from "./mail.events";
import { enrichSmtpErrorMessage } from "./smtp-error.utils";

/** Parámetros para enviar un correo a uno o más destinatarios. */
export interface SendMailInput {
  subject: string;
  html: string;
  text: string;
  recipients: MailRecipient[];
}

/**
 * Servicio de envío de correo electrónico mediante Nodemailer.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  /**
   * Inyecta la configuración SMTP de la aplicación.
   * @param config - Servicio de configuración.
   */
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  /**
   * Indica si el envío de correo está habilitado según la configuración SMTP.
   * @returns `true` si `SMTP_HOST` está definido.
   */
  isEnabled(): boolean {
    return Boolean(this.config.get("smtp.host", { infer: true }));
  }

  /**
   * Envía un correo con reintentos exponenciales ante fallos transitorios de SMTP.
   * @param input - Asunto, cuerpos HTML/texto y destinatarios.
   * @returns Resultado indicando si se envió y el último error si falló.
   */
  async send(input: SendMailInput): Promise<{ sent: boolean; error: string | null }> {
    if (!this.isEnabled()) {
      this.logger.warn("SMTP_HOST not configured. Skipping mail dispatch.");
      return { sent: false, error: null };
    }

    const recipients = input.recipients.filter((r) => Boolean(r.email));
    if (recipients.length === 0) {
      return { sent: false, error: "no_recipients" };
    }

    const defaultCc = this.config.get("mail.defaultCc", { infer: true }).trim();
    const recipientEmails = new Set(recipients.map((r) => r.email.trim().toLowerCase()));
    const cc =
      defaultCc && !recipientEmails.has(defaultCc.toLowerCase()) ? defaultCc : undefined;

    const maxRetries = 3;
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < maxRetries) {
      attempt += 1;
      try {
        const transporter = this.getTransporter();
        await transporter.sendMail({
          from: {
            name: this.config.get("smtp.fromName", { infer: true }),
            address: this.config.get("smtp.from", { infer: true }),
          },
          to: recipients.map((r) => ({ name: r.name, address: r.email })),
          ...(cc ? { cc } : {}),
          subject: input.subject,
          html: input.html,
          text: input.text,
        });
        return { sent: true, error: null };
      } catch (error) {
        lastError = error as Error;
        this.transporter = null;
        const hint = enrichSmtpErrorMessage(lastError.message);
        this.logger.warn(`Mail attempt ${attempt}/${maxRetries} failed: ${hint}`);
        if (attempt < maxRetries) {
          await this.sleep(1000 * 2 ** (attempt - 1));
        }
      }
    }

    this.logger.error(
      `Mail dispatch failed after ${maxRetries} attempts: ${enrichSmtpErrorMessage(lastError?.message ?? "unknown")}`,
    );
    return { sent: false, error: enrichSmtpErrorMessage(lastError?.message ?? "unknown") };
  }

  /**
   * Verifica la conectividad y credenciales SMTP sin enviar correo.
   * @returns `true` si SMTP está deshabilitado o la verificación fue exitosa.
   */
  async verify(): Promise<boolean> {
    if (!this.isEnabled()) return true;
    try {
      const transporter = this.getTransporter();
      await transporter.verify();
      return true;
    } catch (error) {
      const user = this.config.get("smtp.user", { infer: true });
      const password = this.config.get("smtp.password", { infer: true });
      this.transporter = null;
      this.logger.warn(
        `SMTP verify failed: ${enrichSmtpErrorMessage((error as Error).message)} ` +
          `(user=${user || "<empty>"}, passLen=${password.length})`,
      );
      return false;
    }
  }

  /**
   * Obtiene o crea el transporte Nodemailer reutilizable con la configuración actual.
   * @returns Instancia de transporte SMTP lista para enviar.
   */
  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    const host = this.config.get("smtp.host", { infer: true });
    const port = this.config.get("smtp.port", { infer: true });
    const secure = this.config.get("smtp.secure", { infer: true });
    const auth = this.config.get("smtp.auth", { infer: true });
    const user = this.config.get("smtp.user", { infer: true });
    const password = this.config.get("smtp.password", { infer: true });
    const rejectUnauthorized = this.config.get("smtp.rejectUnauthorized", { infer: true });

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: secure === "ssl" || port === 465,
      requireTLS: secure === "tls",
      auth: auth ? { user, pass: password } : undefined,
      tls: { rejectUnauthorized },
    });

    return this.transporter;
  }

  /**
   * Espera un intervalo antes de reintentar el envío SMTP.
   * @param ms - Milisegundos de espera.
   * @returns Promesa resuelta tras el retardo.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
