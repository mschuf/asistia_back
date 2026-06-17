/**
 * @file persona-photo.multer.config.ts
 * @description Configuración Multer en memoria para subida de fotos de persona.
 */
import { HttpStatus } from "@nestjs/common";
import type { MulterOptions } from "@nestjs/platform-express/multer/interfaces/multer-options.interface";
import { memoryStorage } from "multer";
import { extname } from "path";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import { PERSONA_PHOTO_MAX_INPUT_BYTES } from "./persona-photo.constants";
import { isAllowedPersonaPhotoMime } from "./persona-photo-validation";

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

/** Opciones Multer para recibir una foto de persona en memoria. */
export const personaPhotoMulterOptions: MulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: PERSONA_PHOTO_MAX_INPUT_BYTES, files: 1 },
  fileFilter: (_request, file, callback) => {
    const extension = extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension) && !isAllowedPersonaPhotoMime(file.mimetype, file.originalname)) {
      callback(
        new BusinessException({
          message: "Extensión de imagen no permitida",
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
