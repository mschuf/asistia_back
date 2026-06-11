/**
 * @file export-ticket-created-logs-query.dto.ts
 * @description Parámetros de exportación del reporte ticket.created.
 */
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Min } from "class-validator";
import {
  TICKET_CREATED_LOG_SORT_BY,
  TICKET_CREATED_LOG_SORT_ORDER,
  type TicketCreatedLogSortBy,
  type TicketCreatedLogSortOrder,
} from "./list-ticket-created-logs-query.dto";

/** Formatos de exportación soportados. */
export const TICKET_CREATED_LOG_EXPORT_FORMATS = ["pdf", "xlsx"] as const;

export type TicketCreatedLogExportFormat = (typeof TICKET_CREATED_LOG_EXPORT_FORMATS)[number];

/**
 * Filtros y formato para GET /reports/ticket-created/export.
 */
export class ExportTicketCreatedLogsQueryDto {
  @ApiProperty({ enum: TICKET_CREATED_LOG_EXPORT_FORMATS })
  @IsIn(TICKET_CREATED_LOG_EXPORT_FORMATS)
  format!: TicketCreatedLogExportFormat;

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
