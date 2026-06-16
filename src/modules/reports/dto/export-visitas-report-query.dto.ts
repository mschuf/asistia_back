/**
 * @file export-visitas-report-query.dto.ts
 * @description Parámetros de exportación del reporte de visitas de portería.
 */
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsISO8601, IsOptional, IsString } from "class-validator";
import { VISITA_ESTADO, type VisitaEstado } from "../../visitas/domain/visita-estado";
import {
  VISITA_REPORT_SORT_BY,
  VISITA_REPORT_SORT_ORDER,
  type VisitaReportSortBy,
  type VisitaReportSortOrder,
} from "./list-visitas-report-query.dto";

/** Formatos de exportación soportados. */
export const VISITA_REPORT_EXPORT_FORMATS = ["pdf", "xlsx"] as const;

export type VisitaReportExportFormat = (typeof VISITA_REPORT_EXPORT_FORMATS)[number];

/**
 * Filtros y formato para GET /reports/visitas/export.
 */
export class ExportVisitasReportQueryDto {
  @ApiProperty({ enum: VISITA_REPORT_EXPORT_FORMATS })
  @IsIn(VISITA_REPORT_EXPORT_FORMATS)
  format!: VisitaReportExportFormat;

  @ApiPropertyOptional({ description: "Filter visits with entrada_at on or after this ISO date" })
  @IsOptional()
  @IsISO8601()
  entradaFrom?: string;

  @ApiPropertyOptional({ description: "Filter visits with entrada_at on or before this ISO date" })
  @IsOptional()
  @IsISO8601()
  entradaTo?: string;

  @ApiPropertyOptional({ enum: VISITA_ESTADO })
  @IsOptional()
  @IsIn(VISITA_ESTADO)
  estado?: VisitaEstado;

  @ApiPropertyOptional({ description: "Partial match on persona empresa" })
  @IsOptional()
  @IsString()
  empresa?: string;

  @ApiPropertyOptional({ description: "Partial match on persona nombre" })
  @IsOptional()
  @IsString()
  visitante?: string;

  @ApiPropertyOptional({ description: "Partial match on persona documento" })
  @IsOptional()
  @IsString()
  documento?: string;

  @ApiPropertyOptional({ description: "Partial match on visita motivo" })
  @IsOptional()
  @IsString()
  motivo?: string;

  @ApiPropertyOptional({ description: "Partial match on responsable nombre" })
  @IsOptional()
  @IsString()
  responsable?: string;

  @ApiPropertyOptional({ enum: VISITA_REPORT_SORT_BY, description: "Column to sort by" })
  @IsOptional()
  @IsIn(VISITA_REPORT_SORT_BY)
  sortBy?: VisitaReportSortBy;

  @ApiPropertyOptional({ enum: VISITA_REPORT_SORT_ORDER, description: "Sort direction" })
  @IsOptional()
  @IsIn(VISITA_REPORT_SORT_ORDER)
  sortOrder?: VisitaReportSortOrder;
}
