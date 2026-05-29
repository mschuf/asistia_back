import { plainToInstance } from "class-transformer";
import {
  IsBooleanString,
  IsIn,
  IsNumberString,
  IsOptional,
  IsString,
  MinLength,
  validateSync,
} from "class-validator";

class EnvSchema {
  @IsOptional()
  @IsNumberString()
  SERVER_PORT?: string;

  @IsOptional()
  @IsString()
  SERVER_HOST?: string;

  @IsOptional()
  @IsIn(["development", "production", "test"])
  NODE_ENV?: string;

  @IsOptional()
  @IsString()
  CORS_ORIGIN?: string;

  @IsOptional()
  @IsIn(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
  LOG_LEVEL?: string;

  @IsString()
  @MinLength(16, { message: "JWT_SECRET must be at least 16 characters" })
  JWT_SECRET!: string;

  @IsOptional()
  @IsString()
  JWT_EXPIRES_IN?: string;

  @IsOptional()
  @IsIn(["windows-sso", "ldap"])
  AUTH_PROVIDER?: string;

  @IsOptional()
  @IsString()
  SSO_USER_HEADER?: string;

  @IsOptional()
  @IsBooleanString()
  SSO_DOMAIN_STRIP?: string;

  @IsOptional()
  @IsString()
  DEV_SSO_USERNAME?: string;

  @IsOptional()
  @IsString()
  LDAP_URL?: string;

  @IsOptional()
  @IsString()
  LDAP_DOMAIN?: string;

  @IsOptional()
  @IsString()
  LDAP_BASE_DN?: string;

  @IsOptional()
  @IsString()
  LDAP_ADMIN?: string;

  @IsOptional()
  @IsString()
  LDAP_ADMIN_PWD?: string;

  @IsString()
  GLPI_BASE_URL!: string;

  @IsString()
  GLPI_APP_TOKEN!: string;

  @IsOptional()
  @IsString()
  GLPI_BOOTSTRAP_LOGIN?: string;

  @IsOptional()
  @IsString()
  GLPI_BOOTSTRAP_PASSWORD?: string;

  @IsOptional()
  @IsString()
  GLPI_BOOTSTRAP_USER_TOKEN?: string;

  @IsOptional()
  @IsString()
  GLPI_CATALOG_BOOTSTRAP_LOGIN?: string;

  @IsOptional()
  @IsString()
  GLPI_CATALOG_BOOTSTRAP_PASSWORD?: string;

  @IsOptional()
  @IsString()
  GLPI_CATALOG_BOOTSTRAP_USER_TOKEN?: string;

  @IsOptional()
  @IsNumberString()
  GLPI_DEFAULT_ENTITY?: string;

  @IsOptional()
  @IsNumberString()
  GLPI_REQUEST_TIMEOUT_MS?: string;

  @IsOptional()
  @IsNumberString()
  GLPI_SESSION_TTL_SECONDS?: string;

  @IsOptional()
  @IsBooleanString()
  GLPI_STRIP_SERVICE_ASSIGNMENT?: string;

  @IsOptional()
  @IsNumberString()
  GLPI_SERVICE_USER_ID?: string;

  @IsOptional()
  @IsNumberString()
  CACHE_TTL_DEFAULT_SECONDS?: string;

  @IsOptional()
  @IsNumberString()
  CACHE_TTL_CATALOG_SECONDS?: string;

  @IsOptional()
  @IsString()
  SMTP_HOST?: string;

  @IsOptional()
  @IsNumberString()
  SMTP_PORT?: string;

  @IsOptional()
  @IsIn(["ssl", "tls", "none"])
  SMTP_SECURE?: string;

  @IsOptional()
  @IsBooleanString()
  SMTP_AUTH?: string;

  @IsOptional()
  @IsString()
  SMTP_USER?: string;

  @IsOptional()
  @IsString()
  SMTP_PASSWORD?: string;

  @IsOptional()
  @IsString()
  SMTP_FROM?: string;

  @IsOptional()
  @IsString()
  SMTP_FROM_NAME?: string;

  @IsOptional()
  @IsBooleanString()
  SMTP_REJECT_UNAUTHORIZED?: string;

  @IsOptional()
  @IsNumberString()
  ATTACHMENTS_MAX_BYTES?: string;

  @IsOptional()
  @IsString()
  ATTACHMENTS_ALLOWED_MIME?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvSchema {
  const instance = plainToInstance(EnvSchema, config, { enableImplicitConversion: false });
  const errors = validateSync(instance, { skipMissingProperties: false });

  if (errors.length > 0) {
    const messages = errors
      .map((error) => Object.values(error.constraints ?? {}).join("; "))
      .join("\n");
    throw new Error(`Configuration error:\n${messages}`);
  }

  return instance;
}
