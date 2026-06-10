/**
 * @file configuration.ts
 * @description Lee variables de entorno y construye el objeto tipado de configuración de la aplicación.
 */
import "dotenv/config";

/** Proveedor de autenticación soportado por la API. */
export type AuthProvider = "windows-sso" | "ldap";

/**
 * Estructura completa de configuración cargada desde el entorno.
 */
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
    historySource: "api" | "sql";
    metricsSource: "api" | "sql";
    /** Fuente para escribir el cambio de estado (botones de acción del historial). */
    statusSource: "api" | "sql";
    /** Fuente para crear tickets nuevos. */
    createSource: "api" | "sql";
    /** Fuente para asignar técnico a ticket. */
    assignSource: "api" | "sql";
    /** Fuente para listado de técnicos en `/users/technicians`. */
    techniciansSource: "api" | "sql";
    /** Fuente para listado general de usuarios en `/users`. */
    usersSource: "api" | "sql";
  };
  mysql: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    connectionLimit: number;
    connectTimeoutMs: number;
  };
  postgres: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    connectionLimit: number;
    connectTimeoutMs: number;
    ssl: boolean;
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
  mail: {
    supportTo: string;
    /** CC incluido en todos los correos salientes. */
    defaultCc: string;
    /** POST /mail/send (herramienta de prueba; desactivado por defecto). */
    testEndpointEnabled: boolean;
    /** Técnico por defecto para tickets inbound via /mail/send. */
    inboundDefaultTechnicianId: number;
    /** Tipo por defecto para tickets inbound via /mail/send. */
    inboundDefaultTicketType: "incident" | "request";
  };
  attachments: {
    storagePath: string;
    maxBytes: number;
    allowedMime: string[];
  };
}

/**
 * Lee una variable de entorno como cadena.
 * @param name - Nombre de la variable.
 * @param fallback - Valor por defecto si no está definida o está vacía.
 * @returns Valor leído o fallback/cadena vacía.
 */
function readString(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    if (fallback !== undefined) return fallback;
    return "";
  }
  return value;
}

/**
 * Lee una variable de entorno y elimina espacios al inicio y al final.
 * @param name - Nombre de la variable.
 * @param fallback - Valor por defecto opcional.
 * @returns Cadena recortada.
 */
function readTrimmedString(name: string, fallback?: string): string {
  return readString(name, fallback).trim();
}

/**
 * Lee un secreto del entorno, recortando espacios y comillas envolventes opcionales.
 * @param name - Nombre de la variable.
 * @param fallback - Valor por defecto si no está definida.
 * @returns Secreto normalizado.
 */
function readSecretString(name: string, fallback = ""): string {
  let value = readTrimmedString(name, fallback);
  if (
    value.length >= 2 &&
    ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'")))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

/**
 * Lee una variable de entorno numérica.
 * @param name - Nombre de la variable.
 * @param fallback - Valor por defecto si no es un número válido.
 * @returns Número parseado o fallback.
 */
function readNumber(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Lee una variable de entorno booleana (1/true/yes/si/on).
 * @param name - Nombre de la variable.
 * @param fallback - Valor por defecto si no está definida.
 * @returns Valor booleano interpretado.
 */
function readBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "si", "on"].includes(value.toLowerCase());
}

/**
 * Lee el atributo SameSite de la cookie de autenticación.
 * @param name - Nombre de la variable de entorno.
 * @param fallback - Valor por defecto si el valor no es válido.
 * @returns Política SameSite (`lax`, `strict` o `none`).
 */
function readSameSite(
  name: string,
  fallback: AppConfig["auth"]["cookie"]["sameSite"],
): AppConfig["auth"]["cookie"]["sameSite"] {
  const value = readString(name, fallback).toLowerCase();
  if (value === "strict" || value === "none" || value === "lax") return value;
  return fallback;
}

/**
 * Lee una lista separada por comas desde el entorno.
 * @param name - Nombre de la variable.
 * @param fallback - Lista por defecto si no está definida.
 * @returns Arreglo de cadenas no vacías.
 */
function readList(name: string, fallback: string[] = []): string[] {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Lee la fuente de lectura GLPI (`api` o `sql`) desde el entorno.
 * @param name - Nombre de la variable.
 * @param fallback - Fuente por defecto.
 * @returns `"api"` o `"sql"`.
 */
function readGlpiReadSource(
  name: string,
  fallback: "api" | "sql",
): "api" | "sql" {
  const raw = readString(name, fallback).trim();
  const value = raw.split(/\s+/)[0]?.toLowerCase() ?? fallback;
  return value === "sql" ? "sql" : "api";
}

/**
 * Normaliza la URL base de GLPI aceptando rutas con o sin `apirest.php`.
 * @param raw - URL cruda del entorno.
 * @returns URL terminada en `/apirest.php` o cadena vacía.
 */
function normalizeGlpiBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/\/apirest\.php$/i.test(trimmed)) return trimmed;
  return `${trimmed}/apirest.php`;
}

/**
 * Enmascara un token para logs de depuración sin exponer el valor completo.
 * @param value - Token o secreto a enmascarar.
 * @returns Representación segura para consola.
 */
function maskToken(value: string): string {
  if (!value) return "<empty>";
  if (value.length <= 8) return `${"*".repeat(value.length)} (len=${value.length})`;
  return `${value.slice(0, 6)}ÔÇª${value.slice(-2)} (len=${value.length})`;
}

/**
 * Construye el objeto de configuración completo a partir de `process.env`.
 * @returns Configuración tipada de la aplicación.
 */
export function buildConfig(): AppConfig {
  const nodeEnv = readString("NODE_ENV", "development") as AppConfig["server"]["nodeEnv"];

  // TEMP DEBUG: verificar que .env.server se lee y qu├® credenciales bootstrap quedan activas.
  const dbgBootstrapLogin = readString("GLPI_BOOTSTRAP_LOGIN", "");
  const dbgBootstrapPassword = readString("GLPI_BOOTSTRAP_PASSWORD", "");
  const dbgBootstrapUserToken = readString("GLPI_BOOTSTRAP_USER_TOKEN", "");
  const dbgSmtpHost = readTrimmedString("SMTP_HOST", "");
  const dbgSmtpUser = readTrimmedString("SMTP_USER", "");
  const dbgSmtpPassword = readSecretString("SMTP_PASSWORD", "");
  // eslint-disable-next-line no-console
  console.log(
    `[config] AUTH_PROVIDER=${readString("AUTH_PROVIDER", "")} ` +
      `GLPI_BOOTSTRAP_LOGIN='${dbgBootstrapLogin}' ` +
      `GLPI_BOOTSTRAP_PASSWORD=${dbgBootstrapPassword ? `set(${dbgBootstrapPassword.length})` : "<empty>"} ` +
      `GLPI_BOOTSTRAP_USER_TOKEN=${maskToken(dbgBootstrapUserToken)} ` +
      `GLPI_HISTORY_SOURCE=${readGlpiReadSource("GLPI_HISTORY_SOURCE", "sql")} ` +
      `GLPI_METRICS_SOURCE=${readGlpiReadSource("GLPI_METRICS_SOURCE", "api")} ` +
      `GLPI_STATUS_SOURCE=${readGlpiReadSource("GLPI_STATUS_SOURCE", "api")} ` +
      `GLPI_CREATE_SOURCE=${readGlpiReadSource("GLPI_CREATE_SOURCE", "sql")} ` +
      `GLPI_ASSIGN_SOURCE=${readGlpiReadSource("GLPI_ASSIGN_SOURCE", "sql")} ` +
      `GLPI_TECHNICIANS_SOURCE=${readGlpiReadSource("GLPI_TECHNICIANS_SOURCE", "sql")} ` +
      `GLPI_USERS_SOURCE=${readGlpiReadSource("GLPI_USERS_SOURCE", "sql")}`,
  );
  if (dbgSmtpHost) {
    // eslint-disable-next-line no-console
    console.log(
      `[config] SMTP host=${dbgSmtpHost} port=${readNumber("SMTP_PORT", 587)} ` +
        `secure=${readString("SMTP_SECURE", "tls")} user='${dbgSmtpUser}' ` +
        `password=${dbgSmtpPassword ? `set(${dbgSmtpPassword.length})` : "<empty>"}`,
    );
    if (!dbgSmtpUser) {
      // eslint-disable-next-line no-console
      console.warn("[config] SMTP_HOST is set but SMTP_USER is empty");
    }
    if (!dbgSmtpPassword && readBoolean("SMTP_AUTH", true)) {
      // eslint-disable-next-line no-console
      console.warn("[config] SMTP_HOST is set but SMTP_PASSWORD is empty (auth will fail)");
    }
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
      expiresIn: readString("JWT_EXPIRES_IN", "365d"),
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
      historySource: readGlpiReadSource("GLPI_HISTORY_SOURCE", "sql"),
      metricsSource: readGlpiReadSource("GLPI_METRICS_SOURCE", "api"),
      statusSource: readGlpiReadSource("GLPI_STATUS_SOURCE", "api"),
      createSource: readGlpiReadSource("GLPI_CREATE_SOURCE", "sql"),
      assignSource: readGlpiReadSource("GLPI_ASSIGN_SOURCE", "sql"),
      techniciansSource: readGlpiReadSource("GLPI_TECHNICIANS_SOURCE", "sql"),
      usersSource: readGlpiReadSource("GLPI_USERS_SOURCE", "sql"),
    },
    mysql: {
      host: readString("MYSQL_HOST", ""),
      port: readNumber("MYSQL_PORT", 3306),
      database: readString("MYSQL_DATABASE", ""),
      user: readString("MYSQL_USER", ""),
      password: readString("MYSQL_PASSWORD", ""),
      connectionLimit: readNumber("MYSQL_CONNECTION_LIMIT", 5),
      connectTimeoutMs: readNumber("MYSQL_CONNECT_TIMEOUT_MS", 5000),
    },
    postgres: {
      host: readString("POSTGRES_HOST", ""),
      port: readNumber("POSTGRES_PORT", 5432),
      database: readString("POSTGRES_DATABASE", ""),
      user: readString("POSTGRES_USER", ""),
      password: readString("POSTGRES_PASSWORD", ""),
      connectionLimit: readNumber("POSTGRES_CONNECTION_LIMIT", 5),
      connectTimeoutMs: readNumber("POSTGRES_CONNECT_TIMEOUT_MS", 5000),
      ssl: readBoolean("POSTGRES_SSL", false),
    },
    cache: {
      defaultTtlSeconds: readNumber("CACHE_TTL_DEFAULT_SECONDS", 600),
      catalogTtlSeconds: readNumber("CACHE_TTL_CATALOG_SECONDS", 3600),
    },
    smtp: {
      host: readTrimmedString("SMTP_HOST", ""),
      port: readNumber("SMTP_PORT", 587),
      secure: (readString("SMTP_SECURE", "tls").toLowerCase() as AppConfig["smtp"]["secure"]),
      auth: readBoolean("SMTP_AUTH", true),
      user: readTrimmedString("SMTP_USER", ""),
      password: readSecretString("SMTP_PASSWORD", ""),
      from: readTrimmedString("SMTP_FROM", readTrimmedString("SMTP_USER", "")),
      fromName: readTrimmedString("SMTP_FROM_NAME", "asistIA"),
      rejectUnauthorized: readBoolean("SMTP_REJECT_UNAUTHORIZED", true),
    },
    mail: {
      supportTo: readTrimmedString(
        "MAIL_SUPPORT_TO",
        readTrimmedString("SMTP_FROM", readTrimmedString("SMTP_USER", "")),
      ),
      defaultCc: readTrimmedString("MAIL_DEFAULT_CC"),
      testEndpointEnabled: readBoolean("MAIL_TEST_ENDPOINT_ENABLED", false),
      inboundDefaultTechnicianId: readNumber("MAIL_INBOUND_DEFAULT_TECHNICIAN_ID", 1368),
      inboundDefaultTicketType:
        readString("MAIL_INBOUND_DEFAULT_TICKET_TYPE", "request").toLowerCase() === "incident"
          ? "incident"
          : "request",
    },
    attachments: {
      storagePath: readString("ATTACHMENTS_STORAGE_PATH", "./data/attachments"),
      maxBytes: readNumber("ATTACHMENTS_MAX_BYTES", 50 * 1024 * 1024),
      allowedMime: readList("ATTACHMENTS_ALLOWED_MIME", [
        "image/png",
        "image/jpeg",
        "image/webp",
        "text/plain",
        "text/markdown",
        "text/x-markdown",
        "application/pdf",
      ]),
    },
  };
}
