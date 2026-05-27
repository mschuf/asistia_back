import { HttpException, HttpStatus } from "@nestjs/common";
import type { ApiErrorCode } from "../types/api-error-code";

export interface BusinessExceptionPayload {
  message: string;
  code: ApiErrorCode;
  status?: HttpStatus;
  details?: unknown;
}

export class BusinessException extends HttpException {
  public readonly code: ApiErrorCode;
  public readonly details?: unknown;

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
