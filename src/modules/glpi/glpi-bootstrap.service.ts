/**
 * @file glpi-bootstrap.service.ts
 * @description Gestiona sesiones de servicio GLPI reutilizables para bootstrap y catálogo.
 */
import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GlpiClient, type GlpiInitSessionAuth } from "./glpi.client";
import { GlpiSessionManager } from "./glpi-session.manager";
import { GlpiException } from "../../common/exceptions/glpi.exception";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import type { AppConfig } from "../../config/configuration";

const BOOTSTRAP_SESSION_TTL_SECONDS = 300;

/**
 * Servicio de sesiones bootstrap cacheadas para operaciones sin usuario interactivo.
 */
@Injectable()
export class GlpiBootstrapService {
  private readonly logger = new Logger(GlpiBootstrapService.name);
  private cached: { sessionKey: string; expiresAt: number } | null = null;
  private catalogCached: { sessionKey: string; expiresAt: number } | null = null;

  /** Inyecta cliente GLPI, administrador de sesiones y configuración. */
  constructor(
    private readonly glpi: GlpiClient,
    private readonly glpiSessions: GlpiSessionManager,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Ejecuta una función con sesión bootstrap general (credenciales de servicio).
   * @param fn - Callback que recibe la clave de sesión.
   * @returns Resultado del callback.
   * @throws {BusinessException} Si faltan credenciales o falla `initSession`.
   * @throws {GlpiException} Si GLPI rechaza la operación del callback.
   */
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

  /**
   * Ejecuta una función con sesión bootstrap de catálogo (permisos READ amplios).
   * @param fn - Callback que recibe la clave de sesión.
   * @returns Resultado del callback.
   * @throws {BusinessException} Si faltan credenciales o el perfil no tiene permisos de catálogo.
   * @throws {GlpiException} Si GLPI rechaza la operación del callback.
   */
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
            "Credenciales GLPI de catálogo no configuradas. Defina GLPI_CATALOG_BOOTSTRAP_* " +
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
            "La cuenta GLPI configurada para catálogo no tiene permisos suficientes " +
            "(ITILCategory, Location, Group, User). Use una cuenta de servicio técnica/admin " +
            "en GLPI_CATALOG_BOOTSTRAP_* o GLPI_BOOTSTRAP_LOGIN/PASSWORD. " +
            "El user_token personal de Self-Service no sirve para estos endpoints.",
          code: API_ERROR_CODE.GLPI_FORBIDDEN,
          status: HttpStatus.FORBIDDEN,
        });
      }
      throw error;
    }
  }

  /**
   * Invalida la sesión bootstrap general en caché.
   * @returns void
   * @throws No lanza excepciones.
   */
  invalidate(): void {
    if (this.cached) {
      this.glpiSessions.revoke(this.cached.sessionKey);
      this.cached = null;
    }
  }

  /**
   * Invalida la sesión bootstrap de catálogo en caché.
   * @returns void
   * @throws No lanza excepciones.
   */
  invalidateCatalog(): void {
    if (this.catalogCached) {
      this.glpiSessions.revoke(this.catalogCached.sessionKey);
      this.catalogCached = null;
    }
  }

  /**
   * Obtiene sesión, ejecuta callback y reintenta una vez si la sesión expiró.
   * @param ensure - Función que garantiza una clave de sesión válida.
   * @param invalidate - Función que revoca la sesión ante error de auth.
   * @param fn - Callback de negocio.
   * @param label - Etiqueta para logs.
   * @returns Resultado del callback.
   * @throws Propaga errores del callback o de `ensure`.
   */
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

  /**
   * Indica si el error permite un reintento por sesión inválida o expirada.
   * @param error - Error capturado.
   * @returns `true` si es error de autenticación reintentable.
   * @throws No lanza excepciones.
   */
  private isRetriableAuthError(error: unknown): boolean {
    if (error instanceof GlpiException) {
      return (
        error.code === API_ERROR_CODE.GLPI_AUTH_FAILED ||
        error.code === API_ERROR_CODE.GLPI_SESSION_EXPIRED
      );
    }
    return false;
  }

  /**
   * Reutiliza o crea una clave de sesión bootstrap con TTL en caché.
   * @param bootstrapAuth - Credenciales resueltas.
   * @param cache - Entrada de caché actual o `null`.
   * @param setCache - Callback para actualizar la caché.
   * @param missingCredentialsMessage - Mensaje si no hay credenciales.
   * @returns Clave de sesión válida.
   * @throws {BusinessException} Si faltan credenciales o `initSession` no devuelve token.
   */
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
