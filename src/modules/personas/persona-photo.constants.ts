/**
 * @file persona-photo.constants.ts
 * @description Límites y tipos MIME permitidos para fotos de persona.
 */

/** Tamaño máximo del archivo de entrada antes de procesar (50 MB). */
export const PERSONA_PHOTO_MAX_INPUT_BYTES = 50 * 1024 * 1024;

/** Tamaño máximo del blob final persistido en BD (15 MB). */
export const PERSONA_PHOTO_MAX_OUTPUT_BYTES = 15 * 1024 * 1024;

/** Dimensión máxima en píxeles (ancho o alto) tras redimensionar. */
export const PERSONA_PHOTO_MAX_DIMENSION = 2048;

/** Tipos MIME aceptados en la subida de foto. */
export const PERSONA_PHOTO_ALLOWED_MIME = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
] as const;
