import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Observable, TimeoutError, catchError, throwError, timeout } from "rxjs";
import type { AppConfig } from "../../config/configuration";
import { BusinessException } from "../exceptions/business.exception";
import { API_ERROR_CODE } from "../types/api-error-code";

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const timeoutMs = this.config.get("glpi.requestTimeoutMs", { infer: true });
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
