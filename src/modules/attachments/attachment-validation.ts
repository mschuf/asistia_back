import { HttpStatus } from "@nestjs/common";
import { extname } from "path";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";

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

export function normalizeAttachmentExtension(filename: string): string {
  return extname(filename).toLowerCase();
}

export function isAllowedAttachmentExtension(filename: string): boolean {
  return ALLOWED_ATTACHMENT_EXTENSIONS.has(normalizeAttachmentExtension(filename));
}

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
