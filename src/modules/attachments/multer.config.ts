import { HttpStatus } from "@nestjs/common";
import type { MulterOptions } from "@nestjs/platform-express/multer/interfaces/multer-options.interface";
import { diskStorage } from "multer";
import { extname, join } from "path";
import { randomUUID } from "crypto";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import { isAllowedAttachmentExtension } from "./attachment-validation";

export function buildMulterOptions(opts: {
  maxBytes: number;
  tempDir: string;
}): MulterOptions {
  return {
    storage: diskStorage({
      destination: (_request, _file, callback) => {
        callback(null, opts.tempDir);
      },
      filename: (_request, file, callback) => {
        const extension = extname(file.originalname).toLowerCase();
        callback(null, `${randomUUID()}${extension}`);
      },
    }),
    limits: { fileSize: opts.maxBytes, files: 1 },
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
