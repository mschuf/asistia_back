/**
 * @file all-exceptions.filter.ts
 * @description Filtro global que normaliza cualquier excepción al sobre de error de la API.
 */
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";
import { API_ERROR_CODE, type ApiErrorCode } from "../types/api-error-code";
import { BusinessException } from "../exceptions/business.exception";

/** Formato JSON estándar de error devuelto al cliente. */
interface ErrorEnvelope {
  success: false;
  message: string;
  code: ApiErrorCode;
  details?: unknown;
}

/**
 * Captura excepciones no controladas y las convierte en respuestas HTTP consistentes.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  /**
   * Resuelve la excepción, registra el evento y responde con el sobre de error.
   * @param exception - Error capturado en la cadena de NestJS.
   * @param host - Host de argumentos HTTP.
   * @returns void
   */
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, body } = this.resolve(exception);

    if (status >= 500) {
      this.logger.error(
        `[${request.method} ${request.url}] ${body.message} (${body.code})`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else if (status >= 400) {
      this.logger.warn(
        `[${request.method} ${request.url}] ${status} ${body.code} -> ${body.message}`,
      );
    }

    response.status(status).json(body);
  }

  /**
   * Clasifica la excepción y construye estado HTTP y cuerpo de error.
   * @param exception - Error original.
   * @returns Par `{ status, body }` listo para serializar.
   */
  private resolve(exception: unknown): { status: number; body: ErrorEnvelope } {
    if (exception instanceof BusinessException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const envelope = this.buildEnvelopeFromBusinessException(raw, exception);
      return { status, body: envelope };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const envelope = this.buildEnvelopeFromHttpException(raw, status);
      return { status, body: envelope };
    }

    const message =
      exception instanceof Error ? exception.message : "Internal server error";

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        success: false,
        message: message || "Internal server error",
        code: API_ERROR_CODE.UNKNOWN,
      },
    };
  }

  /**
   * Normaliza la respuesta de una {@link BusinessException}.
   * @param raw - Cuerpo crudo de la excepción.
   * @param exception - Instancia de negocio.
   * @returns Sobre de error tipado.
   */
  private buildEnvelopeFromBusinessException(
    raw: unknown,
    exception: BusinessException,
  ): ErrorEnvelope {
    if (raw && typeof raw === "object" && "success" in raw) {
      return raw as ErrorEnvelope;
    }
    return {
      success: false,
      message: exception.message,
      code: exception.code,
      ...(exception.details !== undefined ? { details: exception.details } : {}),
    };
  }

  /**
   * Normaliza la respuesta de una {@link HttpException} genérica de NestJS.
   * @param raw - Cuerpo crudo de la excepción.
   * @param status - Código HTTP de la excepción.
   * @returns Sobre de error tipado.
   */
  private buildEnvelopeFromHttpException(
    raw: unknown,
    status: number,
  ): ErrorEnvelope {
    const code = this.mapHttpStatusToCode(status);

    if (typeof raw === "string") {
      return { success: false, message: raw, code };
    }

    if (raw && typeof raw === "object") {
      const obj = raw as Record<string, unknown>;
      const messageValue = obj.message;
      const message = Array.isArray(messageValue)
        ? messageValue.map(String).join("; ")
        : typeof messageValue === "string"
          ? messageValue
          : `HTTP ${status}`;
      const resolvedCode =
        typeof obj.code === "string" ? (obj.code as ApiErrorCode) : code;
      return {
        success: false,
        message,
        code: resolvedCode,
        ...(obj.details !== undefined ? { details: obj.details } : {}),
      };
    }

    return { success: false, message: `HTTP ${status}`, code };
  }

  /**
   * Mapea un código HTTP a un {@link ApiErrorCode} estable cuando no viene explícito.
   * @param status - Código de estado HTTP.
   * @returns Código de error de la API más cercano.
   */
  private mapHttpStatusToCode(status: number): ApiErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return API_ERROR_CODE.VALIDATION;
      case HttpStatus.UNAUTHORIZED:
        return API_ERROR_CODE.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return API_ERROR_CODE.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return API_ERROR_CODE.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return API_ERROR_CODE.CONFLICT;
      case HttpStatus.REQUEST_TIMEOUT:
        return API_ERROR_CODE.REQUEST_TIMEOUT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return API_ERROR_CODE.RATE_LIMITED;
      default:
        return API_ERROR_CODE.UNKNOWN;
    }
  }
}
