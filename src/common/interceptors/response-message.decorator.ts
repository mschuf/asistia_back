/**
 * @file response-message.decorator.ts
 * @description Decoradores para personalizar el mensaje del sobre de respuesta o omitir el envoltorio.
 */
import { SetMetadata } from "@nestjs/common";
import { RESPONSE_MESSAGE_KEY, SKIP_RESPONSE_ENVELOPE_KEY } from "./response.interceptor";

/**
 * Define el mensaje de éxito en el sobre `{ success, message, data }`.
 * @param message - Texto del mensaje de respuesta.
 * @returns Decorador de metadatos NestJS.
 */
export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE_KEY, message);

/**
 * Omite el envoltorio estándar de respuesta para el handler marcado.
 * @returns Decorador de metadatos NestJS.
 */
export const SkipResponseEnvelope = () => SetMetadata(SKIP_RESPONSE_ENVELOPE_KEY, true);
