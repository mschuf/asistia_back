import type { TicketAttachmentResponseDto } from "../dto/attachment.response.dto";
import type { TicketAttachmentRow } from "../attachments.types";

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
