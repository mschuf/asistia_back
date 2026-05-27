import { SetMetadata } from "@nestjs/common";
import { RESPONSE_MESSAGE_KEY } from "./response.interceptor";

export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE_KEY, message);
