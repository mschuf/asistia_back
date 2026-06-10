/**
 * @file attachments.sql-repository.ts
 * @description Repositorio SQL para operaciones CRUD de adjuntos en `ticket_attachment`.
 */
import { Injectable } from "@nestjs/common";
import { PostgresService } from "../../postgres/postgres.service";
import type {
  CreateTicketAttachmentInput,
  TicketAttachmentRow,
} from "../attachments.types";

/**
 * Acceso a datos de adjuntos de tickets en Postgres.
 */
@Injectable()
export class AttachmentsSqlRepository {
  /**
   * Inyecta el servicio de Postgres.
   * @param postgres - Cliente de consultas SQL.
   */
  constructor(private readonly postgres: PostgresService) {}

  /**
   * Cuenta cuántos adjuntos tiene un ticket.
   * @param ticketId - ID del ticket.
   * @returns Número total de adjuntos asociados.
   */
  async countByTicketId(ticketId: number): Promise<number> {
    const rows = await this.postgres.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM public.ticket_attachment
       WHERE ticket_id = $1`,
      [ticketId],
    );
    return Number(rows[0]?.total ?? 0);
  }

  /**
   * Inserta un nuevo adjunto y devuelve la fila creada.
   * @param input - Datos del adjunto a persistir.
   * @returns Fila insertada con todos los campos.
   */
  async insert(input: CreateTicketAttachmentInput): Promise<TicketAttachmentRow> {
    const rows = await this.postgres.query<TicketAttachmentRow>(
      `INSERT INTO public.ticket_attachment (
         ticket_id,
         storage_key,
         original_filename,
         mime_type,
         size_bytes,
         uploaded_by_id
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.ticketId,
        input.storageKey,
        input.originalFilename,
        input.mimeType,
        input.sizeBytes,
        input.uploadedById,
      ],
    );
    return rows[0];
  }

  /**
   * Lista adjuntos de un ticket ordenados por fecha de creación.
   * @param ticketId - ID del ticket.
   * @returns Filas de adjuntos del ticket.
   */
  async findByTicketId(ticketId: number): Promise<TicketAttachmentRow[]> {
    return this.postgres.query<TicketAttachmentRow>(
      `SELECT *
       FROM public.ticket_attachment
       WHERE ticket_id = $1
       ORDER BY created_at ASC, id ASC`,
      [ticketId],
    );
  }

  /**
   * Busca un adjunto por ID asegurando que pertenezca al ticket indicado.
   * @param attachmentId - ID del adjunto.
   * @param ticketId - ID del ticket propietario.
   * @returns Fila encontrada o `null` si no existe la combinación.
   */
  async findByIdAndTicketId(
    attachmentId: number,
    ticketId: number,
  ): Promise<TicketAttachmentRow | null> {
    const rows = await this.postgres.query<TicketAttachmentRow>(
      `SELECT *
       FROM public.ticket_attachment
       WHERE id = $1 AND ticket_id = $2
       LIMIT 1`,
      [attachmentId, ticketId],
    );
    return rows[0] ?? null;
  }
}
