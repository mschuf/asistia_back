/** Appends actionable hints for common SMTP failures (Office 365, config, etc.). */
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
