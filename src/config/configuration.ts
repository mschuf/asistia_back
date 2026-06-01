import "dotenv/config";

export type AuthProvider = "windows-sso" | "ldap";

export interface AppConfig {
  server: {
    port: number;
    host: string;
    nodeEnv: "development" | "production" | "test";
    corsOrigin: string[];
    globalPrefix: string;
    apiVersion: string;
  };
  logging: {
    level: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  };
  jwt: {
    secret: string;
    expiresIn: string;
  };
  auth: {
    provider: AuthProvider;
    ssoUserHeader: string;
    ssoDomainStrip: boolean;
    /** Solo desarrollo: login GLPI si no hay header SSO ni body.username. */
    devSsoUsername: string;
    rsa: {
      privateKey: string;
      publicKey: string;
    };
    cookie: {
      name: string;
      secure: boolean;
      sameSite: "lax" | "strict" | "none";
      maxAgeMs: number;
    };
    ldap: {
      url: string;
      domain: string;
      baseDn: string;
      adminUser: string | undefined;
      adminPassword: string | undefined;
    };
  };
  glpi: {
    baseUrl: string;
    appToken: string;
    bootstrapLogin: string;
    bootstrapPassword: string;
    bootstrapUserToken: string;
    /** Cuenta de servicio con READ en cat├ílogo (ITILCategory, Location, Group, User). */
    catalogBootstrapLogin: string;
    catalogBootstrapPassword: string;
    catalogBootstrapUserToken: string;
    defaultEntity: number;
    requestTimeoutMs: number;
    sessionTtlSeconds: number;
    /** Parche legacy: eliminar auto-asignación de la cuenta API tras crear/asignar tickets. */
    stripServiceAssignment: boolean;
    /** ID GLPI del usuario asistIA (opcional; evita getFullSession al hacer strip). */
    serviceUserId: number | null;
  };
  cache: {
    defaultTtlSeconds: number;
    catalogTtlSeconds: number;
  };
  smtp: {
    host: string;
    port: number;
    secure: "ssl" | "tls" | "none";
    auth: boolean;
    user: string;
    password: string;
    from: string;
    fromName: string;
    rejectUnauthorized: boolean;
  };
  attachments: {
    maxBytes: number;
    allowedMime: string[];
  };
}

function readString(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    if (fallback !== undefined) return fallback;
    return "";
  }
  return value;
}

function readNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "si", "on"].includes(value.toLowerCase());
}

function readSameSite(
  name: string,
  fallback: AppConfig["auth"]["cookie"]["sameSite"],
): AppConfig["auth"]["cookie"]["sameSite"] {
  const value = readString(name, fallback).toLowerCase();
  if (value === "strict" || value === "none" || value === "lax") return value;
  return fallback;
}

function readList(name: string, fallback: string[] = []): string[] {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Accepts `http://host/soporte` or `http://host/soporte/apirest.php`. */
function normalizeGlpiBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/\/apirest\.php$/i.test(trimmed)) return trimmed;
  return `${trimmed}/apirest.php`;
}

function maskToken(value: string): string {
  if (!value) return "<empty>";
  if (value.length <= 8) return `${"*".repeat(value.length)} (len=${value.length})`;
  return `${value.slice(0, 6)}ÔÇª${value.slice(-2)} (len=${value.length})`;
}

export function buildConfig(): AppConfig {
  const nodeEnv = readString("NODE_ENV", "development") as AppConfig["server"]["nodeEnv"];

  // TEMP DEBUG: verificar que .env.server se lee y qu├® credenciales bootstrap quedan activas.
  const dbgBootstrapLogin = readString("GLPI_BOOTSTRAP_LOGIN", "");
  const dbgBootstrapPassword = readString("GLPI_BOOTSTRAP_PASSWORD", "");
  const dbgBootstrapUserToken = readString("GLPI_BOOTSTRAP_USER_TOKEN", "");
  const dbgSmtpHost = readString("SMTP_HOST", "");
  const dbgSmtpUser = readString("SMTP_USER", "");
  const dbgSmtpPassword = readString("SMTP_PASSWORD", "");
  // eslint-disable-next-line no-console
  console.log(
    `[config] AUTH_PROVIDER=${readString("AUTH_PROVIDER", "")} ` +
      `GLPI_BOOTSTRAP_LOGIN='${dbgBootstrapLogin}' ` +
      `GLPI_BOOTSTRAP_PASSWORD=${dbgBootstrapPassword ? `set(${dbgBootstrapPassword.length})` : "<empty>"} ` +
      `GLPI_BOOTSTRAP_USER_TOKEN=${maskToken(dbgBootstrapUserToken)}`,
  );
  if (dbgSmtpHost) {
    // eslint-disable-next-line no-console
    console.log(
      `[config] SMTP host=${dbgSmtpHost} port=${readNumber("SMTP_PORT", 587)} ` +
        `secure=${readString("SMTP_SECURE", "tls")} user='${dbgSmtpUser}' ` +
        `password=${dbgSmtpPassword ? `set(${dbgSmtpPassword.length})` : "<empty>"}`,
    );
  }

  return {
    server: {
      port: readNumber("SERVER_PORT", 1001),
      host: readString("SERVER_HOST", "0.0.0.0"),
      nodeEnv,
      corsOrigin: readList("CORS_ORIGIN", ["http://localhost:5173", "http://127.0.0.1:5173"]),
      globalPrefix: readString("API_GLOBAL_PREFIX", "api"),
      apiVersion: readString("API_VERSION", "v1"),
    },
    logging: {
      level: (readString("LOG_LEVEL", nodeEnv === "production" ? "error" : "info") as AppConfig["logging"]["level"]),
    },
    jwt: {
      secret: readString("JWT_SECRET", "change-me-in-production-please-32-chars-min"),
      expiresIn: readString("JWT_EXPIRES_IN", "31d"),
    },
    auth: {
      provider: (readString("AUTH_PROVIDER", "ldap") as AuthProvider),
      ssoUserHeader: readString("SSO_USER_HEADER", "x-forwarded-user").toLowerCase(),
      ssoDomainStrip: readBoolean("SSO_DOMAIN_STRIP", true),
      devSsoUsername:
        nodeEnv !== "production" ? readString("DEV_SSO_USERNAME", "") : "",
      rsa: {
        privateKey: readString("AUTH_RSA_PRIVATE_KEY", ""),
        publicKey: readString("AUTH_RSA_PUBLIC_KEY", ""),
      },
      cookie: {
        name: readString("AUTH_COOKIE_NAME", "asistia_access_token"),
        secure: readBoolean("AUTH_COOKIE_SECURE", nodeEnv === "production"),
        sameSite: readSameSite("AUTH_COOKIE_SAME_SITE", "lax"),
        maxAgeMs: readNumber("AUTH_COOKIE_MAX_AGE", 0),
      },
      ldap: {
        url: readString("LDAP_URL", ""),
        domain: readString("LDAP_DOMAIN", ""),
        baseDn: readString("LDAP_BASE_DN", ""),
        adminUser: process.env.LDAP_ADMIN,
        adminPassword: process.env.LDAP_ADMIN_PWD,
      },
    },
    glpi: {
      baseUrl: normalizeGlpiBaseUrl(readString("GLPI_BASE_URL", "")),
      appToken: readString("GLPI_APP_TOKEN", ""),
      bootstrapLogin: readString("GLPI_BOOTSTRAP_LOGIN", ""),
      bootstrapPassword: readString("GLPI_BOOTSTRAP_PASSWORD", ""),
      bootstrapUserToken: readString("GLPI_BOOTSTRAP_USER_TOKEN", ""),
      catalogBootstrapLogin: readString("GLPI_CATALOG_BOOTSTRAP_LOGIN", ""),
      catalogBootstrapPassword: readString("GLPI_CATALOG_BOOTSTRAP_PASSWORD", ""),
      catalogBootstrapUserToken: readString("GLPI_CATALOG_BOOTSTRAP_USER_TOKEN", ""),
      defaultEntity: readNumber("GLPI_DEFAULT_ENTITY", 0),
      requestTimeoutMs: readNumber("GLPI_REQUEST_TIMEOUT_MS", 15000),
      sessionTtlSeconds: readNumber("GLPI_SESSION_TTL_SECONDS", 8 * 3600),
      stripServiceAssignment: readBoolean("GLPI_STRIP_SERVICE_ASSIGNMENT", false),
      serviceUserId: (() => {
        const raw = readString("GLPI_SERVICE_USER_ID", "");
        if (!raw) return null;
        const parsed = Number(raw);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      })(),
    },
    cache: {
      defaultTtlSeconds: readNumber("CACHE_TTL_DEFAULT_SECONDS", 600),
      catalogTtlSeconds: readNumber("CACHE_TTL_CATALOG_SECONDS", 3600),
    },
    smtp: {
      host: readString("SMTP_HOST", ""),
      port: readNumber("SMTP_PORT", 587),
      secure: (readString("SMTP_SECURE", "tls").toLowerCase() as AppConfig["smtp"]["secure"]),
      auth: readBoolean("SMTP_AUTH", true),
      user: readString("SMTP_USER", ""),
      password: readString("SMTP_PASSWORD", ""),
      from: readString("SMTP_FROM", readString("SMTP_USER", "")),
      fromName: readString("SMTP_FROM_NAME", "asistIA"),
      rejectUnauthorized: readBoolean("SMTP_REJECT_UNAUTHORIZED", true),
    },
    attachments: {
      maxBytes: readNumber("ATTACHMENTS_MAX_BYTES", 5 * 1024 * 1024),
      allowedMime: readList("ATTACHMENTS_ALLOWED_MIME", [
        "image/png",
        "image/jpeg",
        "image/webp",
      ]),
    },
  };
}
