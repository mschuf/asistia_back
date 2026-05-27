import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GlpiClient, type GlpiInitSessionAuth } from "./glpi.client";
import { GlpiSessionManager } from "./glpi-session.manager";
import { GlpiException } from "../../common/exceptions/glpi.exception";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import type { AppConfig } from "../../config/configuration";

const BOOTSTRAP_SESSION_TTL_SECONDS = 300;

@Injectable()
export class GlpiBootstrapService {
  private readonly logger = new Logger(GlpiBootstrapService.name);
  private cached: { sessionKey: string; expiresAt: number } | null = null;
  private catalogCached: { sessionKey: string; expiresAt: number } | null = null;

  constructor(
    private readonly glpi: GlpiClient,
    private readonly glpiSessions: GlpiSessionManager,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async withBootstrapSession<T>(fn: (sessionKey: string) => Promise<T>): Promise<T> {
    return this.withSession(
      () =>
        this.ensureSessionKey(
          this.glpi.resolveBootstrapAuth(),
          this.cached,
          (entry) => {
            this.cached = entry;
          },
          "GLPI bootstrap credentials missing. Set GLPI_BOOTSTRAP_USER_TOKEN or GLPI_BOOTSTRAP_LOGIN + GLPI_BOOTSTRAP_PASSWORD in .env.server.",
        ),
      () => {
        this.invalidate();
      },
      fn,
      "bootstrap",
    );
  }

  async withCatalogBootstrapSession<T>(fn: (sessionKey: string) => Promise<T>): Promise<T> {
    try {
      return await this.withSession(
        () =>
          this.ensureSessionKey(
            this.glpi.resolveCatalogBootstrapAuth(),
            this.catalogCached,
            (entry) => {
              this.catalogCached = entry;
            },
            "Credenciales GLPI de cat├ílogo no configuradas. Defina GLPI_CATALOG_BOOTSTRAP_* " +
              "o GLPI_BOOTSTRAP_LOGIN + GLPI_BOOTSTRAP_PASSWORD con una cuenta de servicio " +
              "que tenga permiso READ sobre ITILCategory, Location, Group y User.",
          ),
        () => {
          this.invalidateCatalog();
        },
        fn,
        "catalog bootstrap",
      );
    } catch (error) {
      if (
        error instanceof GlpiException &&
        error.code === API_ERROR_CODE.GLPI_FORBIDDEN
      ) {
        throw new BusinessException({
          message:
            "La cuenta GLPI configurada para cat├ílogo no tiene permisos suficientes " +
            "(ITILCategory, Location, Group, User). Use una cuenta de servicio t├®cnica/admin " +
            "en GLPI_CATALOG_BOOTSTRAP_* o GLPI_BOOTSTRAP_LOGIN/PASSWORD. " +
            "El user_token personal de Self-Service no sirve para estos endpoints.",
          code: API_ERROR_CODE.GLPI_FORBIDDEN,
          status: HttpStatus.FORBIDDEN,
        });
      }
      throw error;
    }
  }

  invalidate(): void {
    if (this.cached) {
      this.glpiSessions.revoke(this.cached.sessionKey);
      this.cached = null;
    }
  }

  invalidateCatalog(): void {
    if (this.catalogCached) {
      this.glpiSessions.revoke(this.catalogCached.sessionKey);
      this.catalogCached = null;
    }
  }

  private async withSession<T>(
    ensure: () => Promise<string>,
    invalidate: () => void,
    fn: (sessionKey: string) => Promise<T>,
    label: string,
  ): Promise<T> {
    try {
      const sessionKey = await ensure();
      return await fn(sessionKey);
    } catch (error) {
      if (this.isRetriableAuthError(error)) {
        this.logger.warn(
          `${label} session rejected by GLPI, retrying once: ${(error as Error).message}`,
        );
        invalidate();
        const sessionKey = await ensure();
        return fn(sessionKey);
      }
      throw error;
    }
  }

  private isRetriableAuthError(error: unknown): boolean {
    if (error instanceof GlpiException) {
      return (
        error.code === API_ERROR_CODE.GLPI_AUTH_FAILED ||
        error.code === API_ERROR_CODE.GLPI_SESSION_EXPIRED
      );
    }
    return false;
  }

  private async ensureSessionKey(
    bootstrapAuth: GlpiInitSessionAuth,
    cache: { sessionKey: string; expiresAt: number } | null,
    setCache: (entry: { sessionKey: string; expiresAt: number }) => void,
    missingCredentialsMessage: string,
  ): Promise<string> {
    const now = Date.now();
    if (cache && now < cache.expiresAt) {
      return cache.sessionKey;
    }

    if (cache) {
      this.glpiSessions.revoke(cache.sessionKey);
    }

    if (!bootstrapAuth.userToken && !(bootstrapAuth.login && bootstrapAuth.password)) {
      throw new BusinessException({
        message: missingCredentialsMessage,
        code: API_ERROR_CODE.GLPI_AUTH_FAILED,
        status: HttpStatus.SERVICE_UNAVAILABLE,
      });
    }

    const response = await this.glpi.initSession(bootstrapAuth);
    const sessionToken = response.data.session_token;
    if (!sessionToken) {
      throw new BusinessException({
        message: "Could not bootstrap GLPI session",
        code: API_ERROR_CODE.GLPI_AUTH_FAILED,
        status: HttpStatus.BAD_GATEWAY,
      });
    }

    const sessionKey = this.glpiSessions.issueKey();
    this.glpiSessions.register(
      sessionKey,
      {
        sessionToken,
        userId: 0,
        login: "_bootstrap",
        createdAt: Date.now(),
      },
      BOOTSTRAP_SESSION_TTL_SECONDS,
    );

    const entry = {
      sessionKey,
      expiresAt: now + BOOTSTRAP_SESSION_TTL_SECONDS * 1000,
    };
    setCache(entry);

    return sessionKey;
  }
}

export interface GlpiFullSessionResponse {
  session?: {
    glpiID?: number;
    glpiname?: string;
    glpirealname?: string;
    glpifirstname?: string;
    glpiemail?: string;
    glpigroups?: number[];
    glpiactive_entity?: number;
    glpiactive_entity_name?: string;
    glpiactive_entity_shortname?: string;
  };
}
