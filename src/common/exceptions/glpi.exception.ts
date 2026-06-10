/**
 * @file glpi.exception.ts
 * @description Excepción de negocio especializada para errores originados en GLPI.
 */
import { HttpStatus } from "@nestjs/common";
import { BusinessException } from "./business.exception";
import type { ApiErrorCode } from "../types/api-error-code";

/**
 * Excepción HTTP que incluye el código de error devuelto por GLPI cuando aplica.
 */
export class GlpiException extends BusinessException {
  /** Código de error reportado por GLPI, si existe. */
  public readonly glpiCode: string | null;

  /**
   * Crea una excepción de integración GLPI con código de API y detalle opcional.
   * @param opts - Mensaje, código de API, estado HTTP, código GLPI y detalles.
   */
  constructor(opts: {
    message: string;
    code: ApiErrorCode;
    status?: HttpStatus;
    glpiCode?: string | null;
    details?: unknown;
  }) {
    super({
      message: opts.message,
      code: opts.code,
      status: opts.status ?? HttpStatus.BAD_GATEWAY,
      details: opts.details,
    });
    this.glpiCode = opts.glpiCode ?? null;
  }
}
