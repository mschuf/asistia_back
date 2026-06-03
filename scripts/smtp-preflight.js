/* eslint-disable no-console */
require("dotenv/config");
const nodemailer = require("nodemailer");

function readTrimmed(name, fallback = "") {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value.trim();
}

function readSecret(name, fallback = "") {
  let value = readTrimmed(name, fallback);
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

function hintFor(message) {
  const normalized = message.toLowerCase();
  if (normalized.includes("535") || normalized.includes("authentication unsuccessful")) {
    return [
      "Office 365 rechazó usuario/contraseña.",
      "- Probar login en https://outlook.office.com con SMTP_USER",
      "- Si hay MFA: crear contraseña de aplicación y usarla en SMTP_PASSWORD",
      "- Habilitar 'Authenticated SMTP' en el buzón (Exchange admin)",
      "- SMTP_FROM debe coincidir con SMTP_USER",
      "- Reiniciar el backend tras cambiar .env",
    ].join("\n");
  }
  return null;
}

async function main() {
  const host = readTrimmed("SMTP_HOST");
  const port = Number(process.env.SMTP_PORT || 587);
  const secureMode = readTrimmed("SMTP_SECURE", "tls").toLowerCase();
  const user = readTrimmed("SMTP_USER");
  const password = readSecret("SMTP_PASSWORD");
  const from = readTrimmed("SMTP_FROM", user);
  const authEnabled = !["0", "false", "no", "off"].includes(
    String(process.env.SMTP_AUTH ?? "true").toLowerCase(),
  );

  console.log("SMTP_CONFIG", {
    host: host || "<empty>",
    port,
    secureMode,
    user: user || "<empty>",
    from: from || "<empty>",
    passwordLength: password.length,
    authEnabled,
  });

  if (!host) {
    console.error("FAIL: SMTP_HOST is empty");
    process.exit(1);
  }

  if (authEnabled && (!user || !password)) {
    console.error("FAIL: SMTP_AUTH is enabled but SMTP_USER or SMTP_PASSWORD is empty");
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: secureMode === "ssl" || port === 465,
    requireTLS: secureMode === "tls",
    auth: authEnabled ? { user, pass: password } : undefined,
    tls: {
      rejectUnauthorized: !["0", "false", "no", "off"].includes(
        String(process.env.SMTP_REJECT_UNAUTHORIZED ?? "true").toLowerCase(),
      ),
    },
  });

  try {
    await transporter.verify();
    console.log("OK: SMTP verify succeeded");
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("FAIL:", message);
    const hint = hintFor(message);
    if (hint) {
      console.error(hint);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Unexpected error", error);
  process.exit(1);
});
