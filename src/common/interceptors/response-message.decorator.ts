import { SetMetadata } from "@nestjs/common";
import { RESPONSE_MESSAGE_KEY, SKIP_RESPONSE_ENVELOPE_KEY } from "./response.interceptor";

export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE_KEY, message);

export const SkipResponseEnvelope = () => SetMetadata(SKIP_RESPONSE_ENVELOPE_KEY, true);
