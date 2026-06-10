/**
 * @file glpi-error.mapper.ts
 * @description Traduce errores Axios/GLPI a excepciones `GlpiException` del dominio API.
 */
import { HttpStatus } from "@nestjs/common";
import { AxiosError } from "axios";
import { GlpiException } from "../../../common/exceptions/glpi.exception";
import { API_ERROR_CODE } from "../../../common/types/api-error-code";

interface GlpiErrorEnvelope {
  code?: string | null;
  message?: string;
}

/**
 * Mapeador estático de errores de la integración GLPI.
 */
export class GlpiErrorMapper {
  /**
   * Convierte un error desconocido en `GlpiException` con código API normalizado.
   * @param error - Error original (Axios, GlpiException u otro).
   * @returns Excepción de dominio lista para propagar al cliente.
   * @throws No lanza excepciones; siempre devuelve `GlpiException`.
   */
  static map(error: unknown): GlpiException {
    if (error instanceof GlpiException) return error;

    if (this.isAxiosError(error)) {
      const status = error.response?.status ?? HttpStatus.BAD_GATEWAY;
      const { code, message } = this.extractGlpiError(error);

      const apiCode = this.translate(code, status);
      const resolvedMessage =
        code === "ERROR_RIGHT_MISSING"
          ? "Su perfil GLPI no tiene permisos para esta operación. Verifique que tenga permiso para crear o consultar tickets en GLPI."
          : (message ?? error.message ?? "GLPI request failed");

      return new GlpiException({
        message: resolvedMessage,
        code: apiCode,
        status: this.resolveStatus(apiCode, status),
        glpiCode: code,
        details: error.response?.data ?? null,
      });
    }

    return new GlpiException({
      message: error instanceof Error ? error.message : "Unknown GLPI error",
      code: API_ERROR_CODE.GLPI_UNAVAILABLE,
      status: HttpStatus.BAD_GATEWAY,
      glpiCode: null,
    });
  }

  /**
   * Comprueba si el valor es un error de Axios.
   * @param value - Valor a evaluar.
   * @returns `true` si es instancia de AxiosError.
   * @throws No lanza excepciones.
   */
  private static isAxiosError(value: unknown): value is AxiosError {
    return Boolean(
      value &&
        typeof value === "object" &&
        (value as { isAxiosError?: boolean }).isAxiosError === true,
    );
  }

  /**
   * Extrae código y mensaje del cuerpo de error GLPI.
   * @param error - Error Axios con respuesta HTTP.
   * @returns Sobre sobre con `code` y `message` parseados.
   * @throws No lanza excepciones.
   */
  private static extractGlpiError(error: AxiosError): GlpiErrorEnvelope {
    const data = error.response?.data as unknown;

    if (Array.isArray(data) && data.length >= 2) {
      return {
        code: typeof data[0] === "string" ? data[0] : null,
        message: typeof data[1] === "string" ? data[1] : undefined,
      };
    }

    if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      return {
        code: typeof obj.code === "string" ? obj.code : null,
        message: typeof obj.message === "string" ? obj.message : undefined,
      };
    }

    if (typeof data === "string" && data.length > 0) {
      return { code: null, message: data };
    }

    return { code: null, message: error.message };
  }

  /**
   * Traduce un código GLPI y estado HTTP a código de error API.
   * @param glpiCode - Código de error devuelto por GLPI.
   * @param httpStatus - Estado HTTP de la respuesta.
   * @returns Código normalizado de `API_ERROR_CODE`.
   * @throws No lanza excepciones.
   */
  private static translate(
    glpiCode: string | null | undefined,
    httpStatus: number,
  ): (typeof API_ERROR_CODE)[keyof typeof API_ERROR_CODE] {
    if (glpiCode) {
      switch (glpiCode) {
        case "ERROR_LOGIN_PARAMETERS_MISSING":
        case "ERROR_GLPI_LOGIN":
        case "ERROR_GLPI_LOGIN_USER_TOKEN_PARAMETERS_MISSING":
        case "ERROR_GLPI_LOGIN_WITH_TOKEN":
          return API_ERROR_CODE.GLPI_AUTH_FAILED;
        case "ERROR_SESSION_TOKEN_INVALID":
        case "ERROR_SESSION_TOKEN_MISSING":
          return API_ERROR_CODE.GLPI_SESSION_EXPIRED;
        case "ERROR_ITEM_NOT_FOUND":
        case "ERROR_RESOURCE_NOT_FOUND":
          return API_ERROR_CODE.GLPI_RESOURCE_NOT_FOUND;
        case "ERROR_BAD_ARRAY":
        case "ERROR_JSON_PAYLOAD_INVALID":
        case "ERROR_RANGE_EXCEED_TOTAL":
          return API_ERROR_CODE.GLPI_BAD_REQUEST;
        case "ERROR_RIGHT_MISSING":
          return API_ERROR_CODE.GLPI_FORBIDDEN;
      }
    }

    if (httpStatus === 401 || httpStatus === 403) {
      if (glpiCode === "ERROR_RIGHT_MISSING") {
        return API_ERROR_CODE.GLPI_FORBIDDEN;
      }
      return API_ERROR_CODE.GLPI_AUTH_FAILED;
    }
    if (httpStatus === 404) return API_ERROR_CODE.GLPI_RESOURCE_NOT_FOUND;
    if (httpStatus >= 400 && httpStatus < 500) {
      return API_ERROR_CODE.GLPI_BAD_REQUEST;
    }
    return API_ERROR_CODE.GLPI_UNAVAILABLE;
  }

  /**
   * Resuelve el estado HTTP final según el código API normalizado.
   * @param apiCode - Código de error API.
   * @param originalStatus - Estado HTTP original de GLPI.
   * @returns Estado HTTP para la respuesta de Asistia.
   * @throws No lanza excepciones.
   */
  private static resolveStatus(
    apiCode: (typeof API_ERROR_CODE)[keyof typeof API_ERROR_CODE],
    originalStatus: number,
  ): number {
    if (apiCode === API_ERROR_CODE.GLPI_AUTH_FAILED) return HttpStatus.UNAUTHORIZED;
    if (apiCode === API_ERROR_CODE.GLPI_SESSION_EXPIRED) return HttpStatus.UNAUTHORIZED;
    if (apiCode === API_ERROR_CODE.GLPI_FORBIDDEN) return HttpStatus.FORBIDDEN;
    if (apiCode === API_ERROR_CODE.GLPI_RESOURCE_NOT_FOUND) return HttpStatus.NOT_FOUND;
    if (apiCode === API_ERROR_CODE.GLPI_BAD_REQUEST) return HttpStatus.BAD_REQUEST;
    if (originalStatus >= 500) return HttpStatus.BAD_GATEWAY;
    return originalStatus;
  }
}
