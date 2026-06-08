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

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly reflector: Reflector,
  ) {}

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
