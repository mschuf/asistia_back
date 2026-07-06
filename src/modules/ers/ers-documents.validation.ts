/**
 * @file ers-documents.validation.ts
 * @description Validación de imágenes, PDF y TXT enviados a proyectos ERS.
 */
import { HttpStatus } from "@nestjs/common";
import { extname } from "path";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";

const ALLOWED_MIME_BY_EXTENSION: Record<string, Set<string>> = {
  ".png": new Set(["image/png"]),
  ".jpg": new Set(["image/jpeg", "image/pjpeg"]),
  ".jpeg": new Set(["image/jpeg", "image/pjpeg"]),
  ".gif": new Set(["image/gif"]),
  ".pdf": new Set(["application/pdf", "application/octet-stream"]),
  ".txt": new Set(["text/plain", "application/octet-stream"]),
};

export const ERS_DOCUMENT_ACCEPTED_EXTENSIONS = Object.keys(ALLOWED_MIME_BY_EXTENSION);

export function isErsDocumentExtensionAllowed(filename: string): boolean {
  return ERS_DOCUMENT_ACCEPTED_EXTENSIONS.includes(extname(filename).toLowerCase());
}

/** Valida extensión, MIME, contenido y tamaño antes de llamar a GLPI. */
export function validateErsDocument(input: {
  originalname: string;
  mimetype: string;
  size: number;
  maxBytes: number;
}): void {
  const extension = extname(input.originalname).toLowerCase();
  const acceptedMime = ALLOWED_MIME_BY_EXTENSION[extension];
  if (!acceptedMime?.has(input.mimetype.toLowerCase())) {
    throw new BusinessException({
      message: "Solo se permiten imágenes PNG/JPG/GIF, PDF y TXT",
      code: API_ERROR_CODE.ATTACHMENT_TYPE_NOT_ALLOWED,
      status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    });
  }
  if (input.size <= 0) {
    throw new BusinessException({
      message: "El archivo está vacío",
      code: API_ERROR_CODE.VALIDATION,
      status: HttpStatus.BAD_REQUEST,
    });
  }
  if (input.size > input.maxBytes) {
    throw new BusinessException({
      message: `El archivo supera el máximo de ${input.maxBytes} bytes`,
      code: API_ERROR_CODE.ATTACHMENT_TOO_LARGE,
      status: HttpStatus.PAYLOAD_TOO_LARGE,
    });
  }
}
