import { Injectable } from "@nestjs/common";
import { PostgresService } from "../../postgres/postgres.service";
import type {
  CreateTicketAttachmentInput,
  TicketAttachmentRow,
} from "../attachments.types";

@Injectable()
export class AttachmentsSqlRepository {
  constructor(private readonly postgres: PostgresService) {}

  async countByTicketId(ticketId: number): Promise<number> {
    const rows = await this.postgres.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM public.ticket_attachment
       WHERE ticket_id = $1`,
      [ticketId],
    );
    return Number(rows[0]?.total ?? 0);
  }

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

  async findByTicketId(ticketId: number): Promise<TicketAttachmentRow[]> {
    return this.postgres.query<TicketAttachmentRow>(
      `SELECT *
       FROM public.ticket_attachment
       WHERE ticket_id = $1
       ORDER BY created_at ASC, id ASC`,
      [ticketId],
    );
  }

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
