import { HttpStatus } from "@nestjs/common";
import type { MulterOptions } from "@nestjs/platform-express/multer/interfaces/multer-options.interface";
import { memoryStorage } from "multer";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";

export function buildMulterOptions(opts: {
  maxBytes: number;
  allowedMime: string[];
}): MulterOptions {
  return {
    storage: memoryStorage(),
    limits: { fileSize: opts.maxBytes, files: 1 },
    fileFilter: (_request, file, callback) => {
      if (!opts.allowedMime.includes(file.mimetype)) {
        callback(
          new BusinessException({
            message: `Attachment type ${file.mimetype} is not allowed`,
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
