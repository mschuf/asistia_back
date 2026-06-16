/**
 * @file reports.types.ts
 * @description Tipos internos del módulo de reportes.
 */
import type {
  TicketCreatedLogSortBy,
  TicketCreatedLogSortOrder,
} from "./dto/list-ticket-created-logs-query.dto";

/** Filtros comunes del reporte ticket.created. */
export interface TicketCreatedLogBaseFilters {
  createdFrom?: string;
  createdTo?: string;
  categoryName?: string;
  companyId?: number;
  locationId?: number;
  sortBy?: TicketCreatedLogSortBy;
  sortOrder?: TicketCreatedLogSortOrder;
}

/** Filtros de listado del reporte ticket.created. */
export interface TicketCreatedLogListFilters extends TicketCreatedLogBaseFilters {
  page: number;
  limit: number;
}

/** Resultado de exportación del reporte ticket.created. */
export interface TicketCreatedLogExportResult {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

/** Fila cruda devuelta por Postgres. */
export interface TicketCreatedLogRow {
  created_at: Date | string;
  company: string;
  subject: string | null;
  from_address: string | null;
  requester_email: string | null;
  type: string | null;
  category: string | null;
  mail_sent: string | null;
  http_status: string | null;
  requester_location_id?: number | null;
  requester_location?: string | null;
}

/** Resultado de exportación del reporte de visitas de portería. */
export interface VisitaReportExportResult {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}
