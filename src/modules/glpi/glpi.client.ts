/**
 * @file glpi.client.ts
 * @description Cliente HTTP de bajo nivel para la API REST de GLPI con reintentos y sesiones.
 */
import { HttpService } from "@nestjs/axios";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import { firstValueFrom } from "rxjs";
import { GLPI_ENDPOINTS, GLPI_HEADERS } from "./glpi.constants";
import { GlpiErrorMapper } from "./errors/glpi-error.mapper";
import { GlpiSessionManager } from "./glpi-session.manager";
import type { AppConfig } from "../../config/configuration";
import type { GlpiInitSessionResponse } from "./glpi.types";

export interface GlpiInitSessionAuth {
  login?: string;
  password?: string;
  userToken?: string;
}

export interface GlpiRequestOptions {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  sessionKey?: string;
  sessionToken?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  multipart?: boolean;
  skipAuth?: boolean;
  authorization?: string;
}

export interface GlpiResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
}

/**
 * Cliente HTTP centralizado para comunicarse con GLPI.
 */
@Injectable()
export class GlpiClient {
  private readonly logger = new Logger(GlpiClient.name);
  private readonly maxRetries = 2;

  /** Inyecta HTTP, configuración y administrador de sesiones. */
  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly sessions: GlpiSessionManager,
  ) {}

  /**
   * Ejecuta una petición autenticada contra GLPI con reintentos.
   * @param opts - Opciones de método, ruta, cuerpo y sesión.
   * @returns Respuesta tipada con datos, estado y cabeceras.
   * @throws {GlpiException} Si GLPI responde con error tras agotar reintentos.
   */
  async request<T>(opts: GlpiRequestOptions): Promise<GlpiResponse<T>> {
    return this.executeWithRetry<T>(opts, 0);
  }

  /**
   * Inicia sesión en GLPI con token de usuario o credenciales.
   * @param auth - Credenciales (`userToken` o `login`/`password`).
   * @returns Respuesta con `session_token`.
   * @throws {GlpiException} Si la autenticación falla.
   */
  async initSession(auth: GlpiInitSessionAuth): Promise<GlpiResponse<GlpiInitSessionResponse>> {
    const appToken = this.config.get("glpi.appToken", { infer: true });
    const query: Record<string, string> = {};
    const headers: Record<string, string> = { [GLPI_HEADERS.APP_TOKEN]: appToken };

    if (auth.userToken) {
      headers[GLPI_HEADERS.AUTHORIZATION] = `user_token ${auth.userToken}`;
    } else if (auth.login && auth.password) {
      query.login = auth.login;
      query.password = auth.password;
    }

    return this.request<GlpiInitSessionResponse>({
      method: "GET",
      path: GLPI_ENDPOINTS.INIT_SESSION,
      skipAuth: true,
      query: Object.keys(query).length > 0 ? query : undefined,
      headers,
    });
  }

  /**
   * Resuelve credenciales de bootstrap general desde configuración.
   * @returns Objeto de autenticación con token o login/password.
   * @throws No lanza excepciones.
   */
  resolveBootstrapAuth(): GlpiInitSessionAuth {
    const userToken = this.config.get("glpi.bootstrapUserToken", { infer: true });
    const login = this.config.get("glpi.bootstrapLogin", { infer: true });
    const password = this.config.get("glpi.bootstrapPassword", { infer: true });

    if (userToken) return { userToken };
    if (login && password) return { login, password };
    return {};
  }

  /**
   * Catálogo y listados administrativos requieren un perfil con READ en
   * ITILCategory, Location, Group y User. Prioriza credenciales de servicio
   * explícitas y login/password sobre el user_token personal de desarrollo.
   * @returns Objeto de autenticación para operaciones de catálogo.
   * @throws No lanza excepciones.
   */
  resolveCatalogBootstrapAuth(): GlpiInitSessionAuth {
    const catalogToken = this.config.get("glpi.catalogBootstrapUserToken", { infer: true });
    const catalogLogin = this.config.get("glpi.catalogBootstrapLogin", { infer: true });
    const catalogPassword = this.config.get("glpi.catalogBootstrapPassword", { infer: true });
    const login = this.config.get("glpi.bootstrapLogin", { infer: true });
    const password = this.config.get("glpi.bootstrapPassword", { infer: true });
    const userToken = this.config.get("glpi.bootstrapUserToken", { infer: true });

    if (catalogToken) return { userToken: catalogToken };
    if (catalogLogin && catalogPassword) return { login: catalogLogin, password: catalogPassword };
    if (login && password) return { login, password };
    if (userToken) return { userToken };
    return {};
  }

  /**
   * Ejecuta la petición con backoff exponencial ante errores transitorios.
   * @param opts - Opciones de la petición GLPI.
   * @param attempt - Número de intento actual (0-based).
   * @returns Respuesta tipada de GLPI.
   * @throws {GlpiException} Si el error no es reintentable o se agotan intentos.
   */
  private async executeWithRetry<T>(
    opts: GlpiRequestOptions,
    attempt: number,
  ): Promise<GlpiResponse<T>> {
    const config = this.buildAxiosConfig(opts);
    if (opts.path === GLPI_ENDPOINTS.INIT_SESSION) {
      this.logger.debug(
        `[GLPI-DEBUG] initSession request -> method=${config.method} url=${config.url} ` +
          `params=${JSON.stringify(config.params ?? {})} ` +
          `headers=${JSON.stringify(this.maskHeadersForLog(config.headers as Record<string, string>))}`,
      );
    }
    try {
      const response = await firstValueFrom(this.http.request<T>(config));
      if (opts.path === GLPI_ENDPOINTS.INIT_SESSION) {
        this.logger.debug(
          `[GLPI-DEBUG] initSession response -> status=${response.status} ` +
            `data=${JSON.stringify(response.data)}`,
        );
      }
      return this.toGlpiResponse(response);
    } catch (error) {
      if (opts.path === GLPI_ENDPOINTS.INIT_SESSION) {
        const ax = error as AxiosError;
        this.logger.error(
          `[GLPI-DEBUG] initSession threw -> status=${ax.response?.status ?? "n/a"} ` +
            `data=${JSON.stringify(ax.response?.data ?? null)} ` +
            `message=${ax.message ?? "n/a"}`,
        );
      }
      if (this.shouldRetry(error, attempt)) {
        const delay = 1000 * 2 ** attempt;
        await this.sleep(delay);
        return this.executeWithRetry<T>(opts, attempt + 1);
      }
      throw GlpiErrorMapper.map(error);
    }
  }

  /**
   * Enmascara cabeceras sensibles para logs de depuración.
   * @param headers - Cabeceras HTTP de la petición.
   * @returns Copia con tokens truncados.
   * @throws No lanza excepciones.
   */
  private maskHeadersForLog(
    headers: Record<string, string> | undefined,
  ): Record<string, string> {
    if (!headers) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) {
      const lower = k.toLowerCase();
      if (lower === "authorization" || lower === "app-token") {
        out[k] =
          typeof v === "string" && v.length > 10
            ? `${v.slice(0, 12)}…${v.slice(-2)} (len=${v.length})`
            : "<short>";
      } else {
        out[k] = String(v);
      }
    }
    return out;
  }

  /**
   * Construye la configuración Axios a partir de opciones GLPI.
   * @param opts - Opciones de petición.
   * @returns Configuración lista para `HttpService.request`.
   * @throws No lanza excepciones.
   */
  private buildAxiosConfig(opts: GlpiRequestOptions): AxiosRequestConfig {
    const baseUrl = this.config.get("glpi.baseUrl", { infer: true });
    const appToken = this.config.get("glpi.appToken", { infer: true });
    const timeout = this.config.get("glpi.requestTimeoutMs", { infer: true });

    const sessionToken = !opts.skipAuth
      ? opts.sessionToken ??
        (opts.sessionKey ? this.sessions.getSessionToken(opts.sessionKey) : undefined)
      : undefined;

    const headers: Record<string, string> = {
      [GLPI_HEADERS.APP_TOKEN]: appToken,
      ...(sessionToken ? { [GLPI_HEADERS.SESSION_TOKEN]: sessionToken } : {}),
      ...(opts.authorization ? { [GLPI_HEADERS.AUTHORIZATION]: opts.authorization } : {}),
      ...(opts.multipart ? {} : { [GLPI_HEADERS.CONTENT_TYPE]: "application/json" }),
      ...(opts.headers ?? {}),
    };

    return {
      method: opts.method,
      url: this.buildUrl(baseUrl, opts.path),
      params: opts.query,
      data: opts.body,
      headers,
      timeout,
      validateStatus: (status) => status < 500,
    };
  }

  /**
   * Concatena URL base y ruta relativa de GLPI.
   * @param baseUrl - URL base configurada.
   * @param path - Ruta del endpoint.
   * @returns URL absoluta sin barras duplicadas.
   * @throws No lanza excepciones.
   */
  private buildUrl(baseUrl: string, path: string): string {
    const trimmedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const trimmedPath = path.startsWith("/") ? path.slice(1) : path;
    return `${trimmedBase}/${trimmedPath}`;
  }

  /**
   * Valida el estado HTTP y normaliza cabeceras de respuesta.
   * @param response - Respuesta Axios cruda.
   * @returns Objeto `GlpiResponse` o lanza AxiosError si status >= 400.
   * @throws {AxiosError} Si el estado HTTP indica error de cliente.
   */
  private toGlpiResponse<T>(response: AxiosResponse<T>): GlpiResponse<T> {
    if (response.status >= 400) {
      const error = new AxiosError(
        `Request failed with status code ${response.status}`,
        String(response.status),
        response.config,
        response.request,
        response,
      );
      throw error;
    }

    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(response.headers ?? {})) {
      if (value === undefined || value === null) continue;
      headers[name.toLowerCase()] = Array.isArray(value) ? value.join(",") : String(value);
    }

    return { data: response.data, status: response.status, headers };
  }

  /**
   * Determina si un error de red o 5xx merece reintento.
   * @param error - Error capturado.
   * @param attempt - Número de intento actual.
   * @returns `true` si debe reintentarse.
   * @throws No lanza excepciones.
   */
  private shouldRetry(error: unknown, attempt: number): boolean {
    if (attempt >= this.maxRetries) return false;
    if (!(error instanceof AxiosError)) return false;
    const status = error.response?.status ?? 0;
    if (status >= 500) return true;
    if (!error.response && error.code) {
      return ["ECONNRESET", "ETIMEDOUT", "ECONNABORTED", "ENETUNREACH"].includes(error.code);
    }
    return false;
  }

  /**
   * Espera asíncrona entre reintentos.
   * @param ms - Milisegundos a esperar.
   * @returns Promesa que resuelve tras el delay.
   * @throws No lanza excepciones.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
