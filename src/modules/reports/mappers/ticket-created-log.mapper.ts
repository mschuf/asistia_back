/**
 * @file ticket-created-log.mapper.ts
 * @description Mapeo de filas SQL a DTOs del reporte ticket.created.
 */
import type { TicketCreatedLogResponseDto } from "../dto/ticket-created-log.response.dto";
import type { TicketCreatedLogRow } from "../reports.types";

/**
 * Convierte una fila Postgres en DTO de respuesta API.
 * @param row - Fila cruda del repositorio.
 * @returns DTO serializable del log.
 */
export function mapTicketCreatedLogRowToResponse(
  row: TicketCreatedLogRow,
): TicketCreatedLogResponseDto {
  const createdAt =
    row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at);

  return {
    createdAt,
    company: row.company,
    subject: row.subject?.trim() || null,
    fromAddress: row.from_address?.trim() || null,
    requesterEmail: row.requester_email?.trim() || null,
    type: row.type?.trim() || null,
    category: row.category?.trim() || null,
    mailSent: row.mail_sent?.trim() || null,
    httpStatus: row.http_status?.trim() || null,
    requesterLocation: row.requester_location?.trim() || null,
  };
}
