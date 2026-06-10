/**
 * @file timeout.interceptor.ts
 * @description Interceptor global que cancela handlers que exceden el timeout configurado.
 */
import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { Observable, TimeoutError, catchError, throwError, timeout } from "rxjs";
import type { AppConfig } from "../../config/configuration";
import { BusinessException } from "../exceptions/business.exception";
import { API_ERROR_CODE } from "../types/api-error-code";
import { REQUEST_TIMEOUT_MS_KEY } from "./request-timeout.decorator";

/** Timeout por defecto para endpoints pesados de indicadores TI. */
export const METRICS_HTTP_TIMEOUT_MS = 60_000;

/** Crear ticket puede usar SQL + fallback GLPI API; necesita margen sobre el timeout GLPI. */
export const TICKET_CREATE_HTTP_TIMEOUT_MS = 60_000;

/**
 * Interceptor que aplica timeout por handler o el valor global de GLPI.
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  /** Inyecta configuración y reflector para leer metadatos del handler. */
  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly reflector: Reflector,
  ) {}

  /**
   * Envuelve la ejecución del handler con un límite de tiempo.
   * @param context - Contexto de ejecución HTTP.
   * @param next - Cadena de handlers siguientes.
   * @returns Observable con el resultado o error de timeout.
   * @throws {BusinessException} Si la petición supera el tiempo máximo permitido.
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const handlerTimeout = this.reflector.getAllAndOverride<number | undefined>(
      REQUEST_TIMEOUT_MS_KEY,
      [context.getHandler(), context.getClass()],
    );
    const timeoutMs =
      typeof handlerTimeout === "number" && handlerTimeout > 0
        ? handlerTimeout
        : this.config.get("glpi.requestTimeoutMs", { infer: true });
    return next.handle().pipe(
      timeout(timeoutMs),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          return throwError(
            () =>
              new BusinessException({
                message: "Request timed out",
                code: API_ERROR_CODE.REQUEST_TIMEOUT,
                status: HttpStatus.REQUEST_TIMEOUT,
              }),
          );
        }
        return throwError(() => err);
      }),
    );
  }
}
