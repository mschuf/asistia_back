import type { QueryResultRow } from "pg";

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

export interface CreateTicketAttachmentInput {
  ticketId: number;
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedById: number;
}
