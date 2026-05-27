import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import FormData from "form-data";
import { GlpiClient } from "../glpi/glpi.client";
import { GlpiBootstrapService } from "../glpi/glpi-bootstrap.service";
import { GLPI_ENDPOINTS, GLPI_HEADERS } from "../glpi/glpi.constants";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import type { AppConfig } from "../../config/configuration";

export interface AttachmentUploadResult {
  documentId: number;
  filename: string;
  mimeType: string;
  size: number;
  ticketId: number;
}

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly glpi: GlpiClient,
    private readonly bootstrap: GlpiBootstrapService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async uploadForTicket(
    ticketId: number,
    file: { originalname: string; mimetype: string; buffer: Buffer; size: number },
  ): Promise<AttachmentUploadResult> {
    this.validateFile(file);

    return this.bootstrap.withCatalogBootstrapSession(async (sessionKey) => {
      const form = new FormData();
      const manifest = {
        input: {
          name: file.originalname,
          _filename: [file.originalname],
        },
      };
      form.append("uploadManifest", JSON.stringify(manifest));
      form.append("filename[0]", file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
      });

      const headers = {
        ...form.getHeaders(),
      } as Record<string, string>;
      delete headers[GLPI_HEADERS.CONTENT_TYPE.toLowerCase()];

      let documentId: number;
      try {
        const response = await this.glpi.request<
          { id: number } | Array<{ id: number }>
        >({
          method: "POST",
          path: GLPI_ENDPOINTS.DOCUMENT,
          sessionKey,
          body: form,
          multipart: true,
          headers,
        });
        const data = Array.isArray(response.data) ? response.data[0] : response.data;
        documentId = Number(data.id);
        if (!Number.isFinite(documentId) || documentId <= 0) {
          throw new Error("Invalid document id returned by GLPI");
        }
      } catch (error) {
        this.logger.error(`Document upload failed: ${(error as Error).message}`);
        throw new BusinessException({
          message: "Failed to upload attachment to GLPI",
          code: API_ERROR_CODE.ATTACHMENT_UPLOAD_FAILED,
          status: HttpStatus.BAD_GATEWAY,
        });
      }

      try {
        await this.glpi.request<unknown>({
          method: "POST",
          path: GLPI_ENDPOINTS.DOCUMENT_ITEM,
          sessionKey,
          body: {
            input: {
              documents_id: documentId,
              itemtype: "Ticket",
              items_id: ticketId,
            },
          },
        });
      } catch (error) {
        this.logger.error(`Document_Item link failed: ${(error as Error).message}`);
        throw new BusinessException({
          message: "Attachment uploaded but could not be linked to the ticket",
          code: API_ERROR_CODE.ATTACHMENT_UPLOAD_FAILED,
          status: HttpStatus.BAD_GATEWAY,
        });
      }

      return {
        documentId,
        filename: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        ticketId,
      };
    });
  }

  private validateFile(file: { mimetype: string; size: number }): void {
    const maxBytes = this.config.get("attachments.maxBytes", { infer: true });
    const allowed = this.config.get("attachments.allowedMime", { infer: true });

    if (!allowed.includes(file.mimetype)) {
      throw new BusinessException({
        message: `Attachment type ${file.mimetype} is not allowed`,
        code: API_ERROR_CODE.ATTACHMENT_TYPE_NOT_ALLOWED,
        status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      });
    }
    if (file.size > maxBytes) {
      throw new BusinessException({
        message: `Attachment exceeds the maximum size of ${maxBytes} bytes`,
        code: API_ERROR_CODE.ATTACHMENT_TOO_LARGE,
        status: HttpStatus.PAYLOAD_TOO_LARGE,
      });
    }
  }
}
