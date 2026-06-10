/**
 * @file attachments.types.ts
 * @description Tipos de dominio y filas SQL para adjuntos de tickets en Postgres.
 */
import type { QueryResultRow } from "pg";

/** Fila de la tabla `ticket_attachment` tal como la devuelve Postgres. */
export interface TicketAttachmentRow extends QueryResultRow {
  id: string;
  ticket_id: number;
  storage_key: string;
  original_filename: string;
  mime_type: string;
  size_bytes: string;
  uploaded_by_id: number;
  created_at: Date;
}

/** Datos necesarios para insertar un nuevo adjunto en base de datos. */
export interface CreateTicketAttachmentInput {
  ticketId: number;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedById: number;
}
