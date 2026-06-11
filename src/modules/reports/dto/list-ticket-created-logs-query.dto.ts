/**
 * @file list-ticket-created-logs-query.dto.ts
 * @description Parámetros de consulta para el reporte de logs ticket.created.
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";

/** Columnas ordenables en GET /reports/ticket-created. */
export const TICKET_CREATED_LOG_SORT_BY = [
  "createdAt",
  "company",
  "subject",
  "fromAddress",
  "requesterEmail",
  "type",
  "category",
  "mailSent",
  "httpStatus",
] as const;

export type TicketCreatedLogSortBy = (typeof TICKET_CREATED_LOG_SORT_BY)[number];

/** Dirección de ordenación del reporte. */
export const TICKET_CREATED_LOG_SORT_ORDER = ["asc", "desc"] as const;

export type TicketCreatedLogSortOrder = (typeof TICKET_CREATED_LOG_SORT_ORDER)[number];

/** Tamaño por defecto de página del reporte. */
export const DEFAULT_TICKET_CREATED_LOGS_PAGE_LIMIT = 15;

/** Máximo de registros por página del reporte. */
export const MAX_TICKET_CREATED_LOGS_PAGE_LIMIT = 50_000;

/**
 * Filtros y paginación para GET /reports/ticket-created.
 */
export class ListTicketCreatedLogsQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_TICKET_CREATED_LOGS_PAGE_LIMIT,
    default: DEFAULT_TICKET_CREATED_LOGS_PAGE_LIMIT,
    description: "Logs per page",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_TICKET_CREATED_LOGS_PAGE_LIMIT)
  declare limit?: number;

  @ApiPropertyOptional({ description: "Filter logs created on or after this ISO date" })
  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  @ApiPropertyOptional({ description: "Filter logs created on or before this ISO date" })
  @IsOptional()
  @IsISO8601()
  createdTo?: string;

  @ApiPropertyOptional({ description: "Exact match on details->>'category_name'" })
  @IsOptional()
  @IsString()
  categoryName?: string;

  @ApiPropertyOptional({ type: Number, description: "Filter by company id (l.company_id)" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  companyId?: number;

  @ApiPropertyOptional({ enum: TICKET_CREATED_LOG_SORT_BY, description: "Column to sort by" })
  @IsOptional()
  @IsIn(TICKET_CREATED_LOG_SORT_BY)
  sortBy?: TicketCreatedLogSortBy;

  @ApiPropertyOptional({ enum: TICKET_CREATED_LOG_SORT_ORDER, description: "Sort direction" })
  @IsOptional()
  @IsIn(TICKET_CREATED_LOG_SORT_ORDER)
  sortOrder?: TicketCreatedLogSortOrder;
}
