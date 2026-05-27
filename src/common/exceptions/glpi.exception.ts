import { HttpStatus } from "@nestjs/common";
import { BusinessException } from "./business.exception";
import type { ApiErrorCode } from "../types/api-error-code";

export class GlpiException extends BusinessException {
  public readonly glpiCode: string | null;

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
