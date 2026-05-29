import { SetMetadata } from "@nestjs/common";

export const REQUEST_TIMEOUT_MS_KEY = "requestTimeoutMs";

/** Timeout HTTP del handler (ms). Si no se define, usa `glpi.requestTimeoutMs`. */
export const RequestTimeoutMs = (timeoutMs: number) =>
  SetMetadata(REQUEST_TIMEOUT_MS_KEY, timeoutMs);
