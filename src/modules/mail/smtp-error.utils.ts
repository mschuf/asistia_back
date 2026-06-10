/**
 * @file smtp-error.utils.ts
 * @description Enriquece mensajes de error SMTP con pistas accionables para diagnóstico.
 */

/**
 * Añade sugerencias de configuración a errores SMTP frecuentes (Office 365, certificados, timeouts).
 * Appends actionable hints for common SMTP failures (Office 365, config, etc.).
 * @param message - Mensaje de error original devuelto por Nodemailer o el servidor SMTP.
 * @returns Mensaje original ampliado con indicaciones cuando el patrón es reconocido.
 */
export function enrichSmtpErrorMessage(message: string): string {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("535") ||
    normalized.includes("authentication unsuccessful") ||
    normalized.includes("invalid login")
  ) {
    return (
      `${message}. ` +
      "Revise SMTP_USER y SMTP_PASSWORD en .env y reinicie el backend. " +
      "En Microsoft 365: habilite SMTP AUTH en el buzón, use contraseña de aplicación si hay MFA, " +
      "y confirme que SMTP_FROM coincide con SMTP_USER."
    );
  }

  if (normalized.includes("self signed certificate") || normalized.includes("certificate")) {
    return (
      `${message}. ` +
      "Si usa un relay interno con certificado propio, pruebe SMTP_REJECT_UNAUTHORIZED=false solo en desarrollo."
    );
  }

  if (normalized.includes("etimedout") || normalized.includes("timeout")) {
    return `${message}. Verifique conectividad de red/firewall hacia SMTP_HOST:SMTP_PORT.`;
  }

  return message;
}
