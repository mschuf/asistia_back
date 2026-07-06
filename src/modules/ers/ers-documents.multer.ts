/**
 * @file ers-documents.multer.ts
 * @description Configuración Multer temporal para documentos de proyectos ERS.
 */
import { HttpStatus } from "@nestjs/common";
import type { MulterOptions } from "@nestjs/platform-express/multer/interfaces/multer-options.interface";
import { randomUUID } from "crypto";
import { mkdirSync } from "fs";
import { diskStorage } from "multer";
import { extname } from "path";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import { isErsDocumentExtensionAllowed } from "./ers-documents.validation";

export function buildErsDocumentsMulterOptions(tempDir: string, maxBytes: number): MulterOptions {
  mkdirSync(tempDir, { recursive: true });
  return {
    storage: diskStorage({
      destination: (_request, _file, callback) => callback(null, tempDir),
      filename: (_request, file, callback) =>
        callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`),
    }),
    limits: { files: 1, fileSize: maxBytes },
    fileFilter: (_request, file, callback) => {
      if (!isErsDocumentExtensionAllowed(file.originalname)) {
        callback(
          new BusinessException({
            message: "Solo se permiten imágenes PNG/JPG/GIF, PDF y TXT",
            code: API_ERROR_CODE.ATTACHMENT_TYPE_NOT_ALLOWED,
            status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
          }),
          false,
        );
        return;
      }
      callback(null, true);
    },
  };
}
