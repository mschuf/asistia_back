/**
 * @file request-timeout.decorator.ts
 * @description Decorador para definir timeout HTTP personalizado por handler.
 */
import { SetMetadata } from "@nestjs/common";

/** Clave de metadatos para el timeout del request en milisegundos. */
export const REQUEST_TIMEOUT_MS_KEY = "requestTimeoutMs";

/**
 * Define el timeout HTTP del handler en milisegundos.
 * Si no se define, usa `glpi.requestTimeoutMs`.
 * @param timeoutMs - Duración máxima del handler en ms.
 * @returns Decorador de metadatos NestJS.
 */
export const RequestTimeoutMs = (timeoutMs: number) =>
  SetMetadata(REQUEST_TIMEOUT_MS_KEY, timeoutMs);
