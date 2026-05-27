import { HttpStatus } from "@nestjs/common";
import { AxiosError } from "axios";
import { GlpiException } from "../../../common/exceptions/glpi.exception";
import { API_ERROR_CODE } from "../../../common/types/api-error-code";

interface GlpiErrorEnvelope {
  code?: string | null;
  message?: string;
}

export class GlpiErrorMapper {
  static map(error: unknown): GlpiException {
    if (error instanceof GlpiException) return error;

    if (this.isAxiosError(error)) {
      const status = error.response?.status ?? HttpStatus.BAD_GATEWAY;
      const { code, message } = this.extractGlpiError(error);

      const apiCode = this.translate(code, status);
      const resolvedMessage =
        code === "ERROR_RIGHT_MISSING"
          ? "Su perfil GLPI no tiene permisos para esta operaci├│n. Verifique que tenga permiso para crear o consultar tickets en GLPI."
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

  private static isAxiosError(value: unknown): value is AxiosError {
    return Boolean(
      value &&
        typeof value === "object" &&
        (value as { isAxiosError?: boolean }).isAxiosError === true,
    );
  }

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
