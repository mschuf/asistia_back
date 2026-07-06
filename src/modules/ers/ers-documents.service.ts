/**
 * @file ers-documents.service.ts
 * @description Orquesta documentos ERS almacenados nativamente en GLPI.
 */
import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createReadStream } from "fs";
import { unlink } from "fs/promises";
import FormData from "form-data";
import type { Readable } from "stream";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import type { AppConfig } from "../../config/configuration";
import { GlpiBootstrapService } from "../glpi/glpi-bootstrap.service";
import { GlpiClient } from "../glpi/glpi.client";
import { sanitizeAttachmentFilename } from "../attachments/attachment-filename.utils";
import { ErsHistoryService } from "../ers-history/ers-history.service";
import type { ListErsDocumentsQueryDto } from "./dto/list-ers-documents-query.dto";
import type {
  ErsDocument,
  ErsDocumentContent,
  ErsDocumentList,
  ErsDocumentUpload,
} from "./ers-documents.types";
import { validateErsDocument } from "./ers-documents.validation";
import { ErsDocumentsSqlRepository } from "./repositories/ers-documents.sql-repository";

const GLPI_UPLOAD_TIMEOUT_MS = 180_000;

@Injectable()
export class ErsDocumentsService {
  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly repository: ErsDocumentsSqlRepository,
    private readonly glpi: GlpiClient,
    private readonly bootstrap: GlpiBootstrapService,
    private readonly history: ErsHistoryService,
  ) {}

  async list(projectId: number, query: ListErsDocumentsQueryDto): Promise<ErsDocumentList> {
    await this.requireProject(projectId);
    return this.repository.list(projectId, query);
  }

  /** Sube a GLPI y elimina el temporal independientemente del resultado. */
  async upload(projectId: number, file: ErsDocumentUpload, actorUserId: number): Promise<ErsDocument> {
    try {
      const entityId = await this.requireProject(projectId);
      validateErsDocument({
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        maxBytes: this.config.get("attachments.maxBytes", { infer: true }),
      });
      const safeFilename = sanitizeAttachmentFilename(file.originalname);

      const documentId = await this.bootstrap.withCatalogBootstrapSession(async (sessionKey) => {
        // Se reconstruye en cada intento de sesión porque los streams multipart no son reutilizables.
        const form = new FormData();
        form.append(
          "uploadManifest",
          JSON.stringify({
            input: {
              name: safeFilename,
              itemtype: "Project",
              items_id: projectId,
              entities_id: entityId,
              _filename: [safeFilename],
            },
          }),
          { contentType: "application/json" },
        );
        form.append("filename[0]", createReadStream(file.path), {
          filename: safeFilename,
          contentType: file.mimetype,
          knownLength: file.size,
        });
        const response = await this.glpi.request<unknown>({
          method: "POST",
          path: "Document",
          sessionKey,
          body: form,
          multipart: true,
          headers: form.getHeaders() as Record<string, string>,
          timeoutMs: GLPI_UPLOAD_TIMEOUT_MS,
          retry: false,
        });
        return this.extractDocumentId(response.data);
      });

      const created = await this.repository.findLinkedDocument(projectId, documentId);
      if (!created) {
        throw new BusinessException({
          message: "GLPI creó el documento pero no lo vinculó al proyecto",
          code: API_ERROR_CODE.ATTACHMENT_UPLOAD_FAILED,
          status: HttpStatus.BAD_GATEWAY,
        });
      }
      await this.registerHistorySafe({
        projectId,
        actionType: "create",
        summary: `Se añadió el documento "${created.name}" al proyecto.`,
        actorUserId,
        metadata: { documentId: created.id, documentName: created.name },
        beforeState: null,
        afterState: { document: created },
      });
      return created;
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  }

  async content(projectId: number, documentId: number): Promise<ErsDocumentContent> {
    await this.requireProject(projectId);
    const document = await this.repository.findLinkedDocument(projectId, documentId);
    if (!document) {
      throw new BusinessException({
        message: "El documento no pertenece al proyecto indicado",
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return this.bootstrap.withCatalogBootstrapSession(async (sessionKey) => {
      const response = await this.glpi.request<Readable>({
        method: "GET",
        path: `Document/${documentId}`,
        query: { alt: "media" },
        sessionKey,
        responseType: "stream",
        timeoutMs: GLPI_UPLOAD_TIMEOUT_MS,
      });
      const rawSize = Number(response.headers["content-length"] ?? 0);
      return {
        stream: response.data,
        filename: document.name,
        mimeType: response.headers["content-type"] || document.mimeType,
        size: Number.isFinite(rawSize) && rawSize > 0 ? rawSize : null,
      };
    });
  }

  /** Elimina definitivamente un documento después de validar que pertenece al proyecto. */
  async delete(projectId: number, documentId: number, actorUserId: number): Promise<void> {
    await this.requireProject(projectId);
    const document = await this.repository.findLinkedDocument(projectId, documentId);
    if (!document) {
      throw new BusinessException({
        message: "El documento no pertenece al proyecto indicado",
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    await this.bootstrap.withCatalogBootstrapSession(async (sessionKey) => {
      await this.glpi.request<unknown>({
        method: "DELETE",
        path: `Document/${documentId}`,
        query: { force_purge: true },
        sessionKey,
        retry: false,
      });
    });

    await this.registerHistorySafe({
      projectId,
      actionType: "delete",
      summary: `Se eliminó el documento "${document.name}" del proyecto.`,
      actorUserId,
      metadata: { documentId: document.id, documentName: document.name },
      beforeState: { document },
      afterState: null,
    });
  }

  private async registerHistorySafe(input: {
    projectId: number;
    actionType: "create" | "delete";
    summary: string;
    actorUserId: number;
    metadata: Record<string, unknown>;
    beforeState: Record<string, unknown> | null;
    afterState: Record<string, unknown> | null;
  }): Promise<void> {
    try {
      await this.history.registerEvent(input);
    } catch {
      // El historial es informativo y no debe revertir una operación ya confirmada por GLPI.
    }
  }

  private async requireProject(projectId: number): Promise<number> {
    const entityId = await this.repository.findProjectEntity(projectId);
    if (entityId === null) {
      throw new BusinessException({
        message: `No se encontró el proyecto ERS ${projectId}`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }
    return entityId;
  }

  private extractDocumentId(data: unknown): number {
    const candidate = Array.isArray(data) ? data[0] : data;
    if (candidate && typeof candidate === "object") {
      const raw = (candidate as { id?: unknown }).id;
      const id = Number(raw);
      if (Number.isFinite(id) && id > 0) return id;
    }
    throw new BusinessException({
      message: "GLPI no devolvió el identificador del documento",
      code: API_ERROR_CODE.ATTACHMENT_UPLOAD_FAILED,
      status: HttpStatus.BAD_GATEWAY,
    });
  }
}
