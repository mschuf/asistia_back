/**
 * @file attachment-validation.ts
 * @description Valida extensiones, tipos MIME y tamaño máximo de archivos adjuntos permitidos.
 */
import { HttpStatus } from "@nestjs/common";
import { extname } from "path";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";

/** Extensiones de archivo permitidas para adjuntos de tickets. */
export const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".jpe",
  ".jfif",
  ".txt",
  ".md",
  ".pdf",
]);

const OCTET_STREAM_MIME = "application/octet-stream";

/**
 * Normaliza la extensión de un nombre de archivo a minúsculas.
 * @param filename - Nombre de archivo con o sin ruta.
 * @returns Extensión incluyendo el punto, en minúsculas.
 */
export function normalizeAttachmentExtension(filename: string): string {
  return extname(filename).toLowerCase();
}

/**
 * Indica si la extensión del archivo está en la lista permitida.
 * @param filename - Nombre de archivo a evaluar.
 * @returns `true` si la extensión está permitida.
 */
export function isAllowedAttachmentExtension(filename: string): boolean {
  return ALLOWED_ATTACHMENT_EXTENSIONS.has(normalizeAttachmentExtension(filename));
}

/**
 * Comprueba si el MIME declarado es coherente con la extensión y la lista configurada.
 * @param mimetype - Tipo MIME reportado por el cliente o Multer.
 * @param filename - Nombre original del archivo.
 * @param allowedMime - Lista de tipos MIME permitidos por configuración.
 * @returns `true` si el par MIME/extensión es válido.
 */
export function isMimeAllowedForAttachment(
  mimetype: string,
  filename: string,
  allowedMime: string[],
): boolean {
  if (allowedMime.includes(mimetype)) {
    return isAllowedAttachmentExtension(filename);
  }

  if (mimetype === OCTET_STREAM_MIME && isAllowedAttachmentExtension(filename)) {
    const extension = normalizeAttachmentExtension(filename);
    return extension === ".pdf" || extension === ".md";
  }

  return false;
}

/**
 * Valida tipo y tamaño de un adjunto; lanza excepción de negocio si no cumple.
 * @param input - Metadatos del archivo y límites de configuración.
 * @returns void
 * @throws {BusinessException} Si el tipo MIME no está permitido o el tamaño supera el máximo.
 */
export function validateAttachmentFile(input: {
  originalname: string;
  mimetype: string;
  size: number;
  maxBytes: number;
  allowedMime: string[];
}): void {
  if (!isMimeAllowedForAttachment(input.mimetype, input.originalname, input.allowedMime)) {
    throw new BusinessException({
      message: `Attachment type ${input.mimetype} is not allowed`,
      code: API_ERROR_CODE.ATTACHMENT_TYPE_NOT_ALLOWED,
      status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    });
  }

  if (input.size > input.maxBytes) {
    throw new BusinessException({
      message: `Attachment exceeds the maximum size of ${input.maxBytes} bytes`,
      code: API_ERROR_CODE.ATTACHMENT_TOO_LARGE,
      status: HttpStatus.PAYLOAD_TOO_LARGE,
    });
  }
}
