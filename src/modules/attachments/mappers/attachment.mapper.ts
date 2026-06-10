/**
 * @file attachment.mapper.ts
 * @description Mapea filas SQL de adjuntos a DTOs de respuesta de la API.
 */
import type { TicketAttachmentResponseDto } from "../dto/attachment.response.dto";
import type { TicketAttachmentRow } from "../attachments.types";

/**
 * Convierte una fila de adjunto de Postgres al DTO expuesto por la API.
 * @param row - Fila de la tabla `ticket_attachment`.
 * @returns DTO con tipos normalizados para el cliente.
 */
export function mapAttachmentRowToResponse(row: TicketAttachmentRow): TicketAttachmentResponseDto {
  return {
    id: Number(row.id),
    ticketId: row.ticket_id,
    filename: row.original_filename,
    mimeType: row.mime_type,
    size: Number(row.size_bytes),
    uploadedById: row.uploaded_by_id,
    createdAt: row.created_at.toISOString(),
  };
}
