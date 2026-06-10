/**
 * @file multer.config.ts
 * @description Construye opciones de Multer para subida temporal de adjuntos con filtros de extensión.
 */
import { HttpStatus } from "@nestjs/common";
import type { MulterOptions } from "@nestjs/platform-express/multer/interfaces/multer-options.interface";
import { diskStorage } from "multer";
import { extname, join } from "path";
import { randomUUID } from "crypto";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import { isAllowedAttachmentExtension } from "./attachment-validation";

/**
 * Construye la configuración de Multer para adjuntos de tickets.
 * @param opts - Límite de tamaño y directorio temporal de destino.
 * @returns Opciones de Multer con almacenamiento en disco y filtro de extensiones.
 */
export function buildMulterOptions(opts: {
  maxBytes: number;
  tempDir: string;
}): MulterOptions {
  return {
    storage: diskStorage({
      /**
       * Determina el directorio temporal donde Multer guarda el archivo entrante.
       * @param _request - Petición HTTP (no usada).
       * @param _file - Archivo entrante (no usado).
       * @param callback - Callback de Multer con ruta destino o error.
       * @returns void
       */
      destination: (_request, _file, callback) => {
        callback(null, opts.tempDir);
      },
      /**
       * Genera un nombre de archivo temporal único conservando la extensión original.
       * @param _request - Petición HTTP (no usada).
       * @param file - Archivo entrante con nombre original.
       * @param callback - Callback de Multer con nombre generado o error.
       * @returns void
       */
      filename: (_request, file, callback) => {
        const extension = extname(file.originalname).toLowerCase();
        callback(null, `${randomUUID()}${extension}`);
      },
    }),
    limits: { fileSize: opts.maxBytes, files: 1 },
    /**
     * Filtra archivos rechazando extensiones no permitidas antes de persistirlos.
     * @param _request - Petición HTTP (no usada).
     * @param file - Archivo entrante a validar.
     * @param callback - Callback de Multer indicando aceptación o error.
     * @returns void
     * @throws {BusinessException} Si la extensión del archivo no está permitida.
     */
    fileFilter: (_request, file, callback) => {
      if (!isAllowedAttachmentExtension(file.originalname)) {
        callback(
          new BusinessException({
            message: `Attachment extension is not allowed`,
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
