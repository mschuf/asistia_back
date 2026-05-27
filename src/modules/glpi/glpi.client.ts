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

@Injectable()
export class GlpiClient {
  private readonly logger = new Logger(GlpiClient.name);
  private readonly maxRetries = 2;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly sessions: GlpiSessionManager,
  ) {}

  async request<T>(opts: GlpiRequestOptions): Promise<GlpiResponse<T>> {
    return this.executeWithRetry<T>(opts, 0);
  }

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

  resolveBootstrapAuth(): GlpiInitSessionAuth {
    const userToken = this.config.get("glpi.bootstrapUserToken", { infer: true });
    const login = this.config.get("glpi.bootstrapLogin", { infer: true });
    const password = this.config.get("glpi.bootstrapPassword", { infer: true });

    if (userToken) return { userToken };
    if (login && password) return { login, password };
    return {};
  }

  /**
   * Cat├ílogo y listados administrativos requieren un perfil con READ en
   * ITILCategory, Location, Group y User. Prioriza credenciales de servicio
   * expl├¡citas y login/password sobre el user_token personal de desarrollo.
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
            ? `${v.slice(0, 12)}ÔÇª${v.slice(-2)} (len=${v.length})`
            : "<short>";
      } else {
        out[k] = String(v);
      }
    }
    return out;
  }

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

  private buildUrl(baseUrl: string, path: string): string {
    const trimmedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const trimmedPath = path.startsWith("/") ? path.slice(1) : path;
    return `${trimmedBase}/${trimmedPath}`;
  }

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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
