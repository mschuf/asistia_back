/**
 * @file persona-photo-validation.ts
 * @description Valida tipo MIME y tamaño de entrada para fotos de persona.
 */
import { HttpStatus } from "@nestjs/common";
import { extname } from "path";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import {
  PERSONA_PHOTO_ALLOWED_MIME,
  PERSONA_PHOTO_MAX_INPUT_BYTES,
} from "./persona-photo.constants";

const ALLOWED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".jpe",
  ".jfif",
  ".png",
  ".webp",
  ".gif",
  ".heic",
  ".heif",
]);

const OCTET_STREAM_MIME = "application/octet-stream";

/**
 * Indica si el MIME declarado es válido para una foto de persona.
 * @param mimetype - Tipo MIME reportado por Multer.
 * @param originalname - Nombre original del archivo.
 * @returns `true` si el archivo parece ser una imagen permitida.
 */
export function isAllowedPersonaPhotoMime(mimetype: string, originalname: string): boolean {
  const normalizedMime = mimetype.toLowerCase();
  if ((PERSONA_PHOTO_ALLOWED_MIME as readonly string[]).includes(normalizedMime)) {
    return true;
  }

  if (normalizedMime === OCTET_STREAM_MIME) {
    const extension = extname(originalname).toLowerCase();
    return ALLOWED_EXTENSIONS.has(extension);
  }

  return false;
}

/**
 * Valida metadatos del archivo subido antes del procesamiento.
 * @param input - Metadatos del archivo recibido por Multer.
 * @throws {BusinessException} Si el tipo no está permitido o supera el límite de entrada.
 */
export function validatePersonaPhotoUpload(input: {
  originalname: string;
  mimetype: string;
  size: number;
}): void {
  if (!input.size) {
    throw new BusinessException({
      message: "La foto recibida está vacía",
      code: API_ERROR_CODE.VALIDATION,
      status: HttpStatus.BAD_REQUEST,
    });
  }

  if (!isAllowedPersonaPhotoMime(input.mimetype, input.originalname)) {
    throw new BusinessException({
      message: `Tipo de imagen no permitido: ${input.mimetype}`,
      code: API_ERROR_CODE.ATTACHMENT_TYPE_NOT_ALLOWED,
      status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    });
  }

  if (input.size > PERSONA_PHOTO_MAX_INPUT_BYTES) {
    throw new BusinessException({
      message: `La foto supera el tamaño máximo de entrada de ${PERSONA_PHOTO_MAX_INPUT_BYTES} bytes`,
      code: API_ERROR_CODE.ATTACHMENT_TOO_LARGE,
      status: HttpStatus.PAYLOAD_TOO_LARGE,
    });
  }
}
