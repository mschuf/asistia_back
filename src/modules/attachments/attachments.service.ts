/**
 * @file attachments.service.ts
 * @description Orquesta la subida, listado y descarga de adjuntos de tickets con validación y almacenamiento local.
 */
import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { ReadStream } from "fs";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import type { AppConfig } from "../../config/configuration";
import { TicketsService } from "../tickets/tickets.service";
import { validateAttachmentFile } from "./attachment-validation";
import type { TicketAttachmentRow } from "./attachments.types";
import type { TicketAttachmentResponseDto } from "./dto/attachment.response.dto";
import { LocalAttachmentStorage } from "./local-attachment.storage";
import { mapAttachmentRowToResponse } from "./mappers/attachment.mapper";
import { AttachmentsSqlRepository } from "./repositories/attachments.sql-repository";

/** Cantidad máxima de adjuntos permitidos por ticket. */
export const MAX_ATTACHMENTS_PER_TICKET = 5;

/** Datos mínimos de un archivo recibido para persistir como adjunto. */
export interface AttachmentUploadInput {
  originalname: string;
  mimetype: string;
  size: number;
  path: string;
}

/** Payload listo para transmitir un adjunto al cliente HTTP. */
export interface AttachmentDownloadPayload {
  stream: ReadStream;
  filename: string;
  mimeType: string;
  size: number;
}

/**
 * Servicio de gestión de adjuntos de tickets.
 */
@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  /**
   * Inyecta configuración, tickets, repositorio y almacenamiento local.
   * @param config - Servicio de configuración de la aplicación.
   * @param tickets - Servicio de tickets para validar acceso.
   * @param repository - Repositorio SQL de adjuntos.
   * @param storage - Almacenamiento local de archivos.
   */
  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly tickets: TicketsService,
    private readonly repository: AttachmentsSqlRepository,
    private readonly storage: LocalAttachmentStorage,
  ) {}

  /**
   * Sube un adjunto para un ticket validando tipo, tamaño y límite por ticket.
   * @param user - Usuario autenticado que realiza la subida.
   * @param ticketId - ID del ticket destino.
   * @param file - Metadatos y ruta temporal del archivo subido.
   * @returns DTO del adjunto persistido.
   * @throws {BusinessException} Si el ticket supera el límite de adjuntos, falla la validación o el almacenamiento.
   */
  async uploadForTicket(
    user: AuthenticatedUser,
    ticketId: number,
    file: AttachmentUploadInput,
  ): Promise<TicketAttachmentResponseDto> {
    await this.tickets.assertTicketAccess(user, ticketId);

    const maxBytes = this.config.get("attachments.maxBytes", { infer: true });
    const allowedMime = this.config.get("attachments.allowedMime", { infer: true });
    validateAttachmentFile({
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      maxBytes,
      allowedMime,
    });

    const currentCount = await this.repository.countByTicketId(ticketId);
    if (currentCount >= MAX_ATTACHMENTS_PER_TICKET) {
      throw new BusinessException({
        message: `A ticket can have at most ${MAX_ATTACHMENTS_PER_TICKET} attachments`,
        code: API_ERROR_CODE.VALIDATION,
        status: HttpStatus.BAD_REQUEST,
      });
    }

    const storageKey = this.storage.buildStorageKey(ticketId, file.originalname);
    let storedPath: string | null = null;

    try {
      const stored = await this.storage.persistFromTemp(file.path, storageKey);
      storedPath = stored.absolutePath;

      const row = await this.repository.insert({
        ticketId,
        storageKey: stored.storageKey,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedById: user.id,
      });

      return mapAttachmentRowToResponse(row);
    } catch (error) {
      if (storedPath) {
        await this.storage.deleteFile(storageKey);
      }
      this.logger.error(`Attachment upload failed: ${(error as Error).message}`);
      throw new BusinessException({
        message: "Failed to store attachment",
        code: API_ERROR_CODE.ATTACHMENT_UPLOAD_FAILED,
        status: HttpStatus.SERVICE_UNAVAILABLE,
      });
    }
  }

  /**
   * Lista los adjuntos de un ticket si el usuario tiene acceso.
   * @param user - Usuario autenticado solicitante.
   * @param ticketId - ID del ticket.
   * @returns Lista de DTOs de adjuntos ordenados por creación.
   * @throws {BusinessException} Si el usuario no tiene acceso al ticket.
   */
  async listForTicket(
    user: AuthenticatedUser,
    ticketId: number,
  ): Promise<TicketAttachmentResponseDto[]> {
    await this.tickets.assertTicketAccess(user, ticketId);
    const rows = await this.repository.findByTicketId(ticketId);
    return rows.map(mapAttachmentRowToResponse);
  }

  /**
   * Resuelve el stream y metadatos para descargar un adjunto concreto.
   * @param user - Usuario autenticado solicitante.
   * @param ticketId - ID del ticket.
   * @param attachmentId - ID del adjunto.
   * @returns Payload con stream de lectura y metadatos del archivo.
   * @throws {BusinessException} Si el usuario no tiene acceso, el adjunto no existe o el archivo no está disponible.
   */
  async resolveDownload(
    user: AuthenticatedUser,
    ticketId: number,
    attachmentId: number,
  ): Promise<AttachmentDownloadPayload> {
    await this.tickets.assertTicketAccess(user, ticketId);

    const row = await this.repository.findByIdAndTicketId(attachmentId, ticketId);
    if (!row) {
      throw new BusinessException({
        message: `Attachment ${attachmentId} not found for ticket ${ticketId}`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return this.buildDownloadPayload(row);
  }

  /**
   * Construye el payload de descarga a partir de una fila de base de datos.
   * @param row - Fila del adjunto en Postgres.
   * @returns Stream y metadatos del archivo en disco.
   * @throws {BusinessException} Si el archivo no puede leerse del almacenamiento.
   */
  private buildDownloadPayload(row: TicketAttachmentRow): AttachmentDownloadPayload {
    try {
      return {
        stream: this.storage.openReadStream(row.storage_key),
        filename: row.original_filename,
        mimeType: row.mime_type,
        size: Number(row.size_bytes),
      };
    } catch (error) {
      this.logger.error(`Attachment read failed: ${(error as Error).message}`);
      throw new BusinessException({
        message: "Attachment file is not available",
        code: API_ERROR_CODE.ATTACHMENT_UPLOAD_FAILED,
        status: HttpStatus.NOT_FOUND,
      });
    }
  }
}
