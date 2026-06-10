/**
 * @file business.exception.ts
 * @description Excepción HTTP estándar para errores de negocio con código estable.
 */
import { HttpException, HttpStatus } from "@nestjs/common";
import type { ApiErrorCode } from "../types/api-error-code";

/**
 * Payload para construir una {@link BusinessException}.
 */
export interface BusinessExceptionPayload {
  message: string;
  code: ApiErrorCode;
  status?: HttpStatus;
  details?: unknown;
}

/**
 * Excepción HTTP con sobre `{ success: false, message, code, details? }`.
 */
export class BusinessException extends HttpException {
  /** Código de error estable de la API. */
  public readonly code: ApiErrorCode;

  /** Detalle adicional opcional para depuración o validación. */
  public readonly details?: unknown;

  /**
   * Construye la respuesta de error de negocio con estado HTTP configurable.
   * @param payload - Mensaje, código, estado y detalles opcionales.
   */
  constructor(payload: BusinessExceptionPayload) {
    const status = payload.status ?? HttpStatus.BAD_REQUEST;
    super(
      {
        success: false,
        message: payload.message,
        code: payload.code,
        ...(payload.details !== undefined ? { details: payload.details } : {}),
      },
      status,
    );
    this.code = payload.code;
    this.details = payload.details;
  }
}
