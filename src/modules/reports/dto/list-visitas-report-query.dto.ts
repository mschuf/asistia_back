/**
 * @file list-visitas-report-query.dto.ts
 * @description Parámetros de consulta para el reporte superadmin de visitas de portería.
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";
import { VISITA_ESTADO, type VisitaEstado } from "../../visitas/domain/visita-estado";

/** Columnas ordenables en GET /reports/visitas. */
export const VISITA_REPORT_SORT_BY = [
  "entradaAt",
  "salidaAt",
  "visitante",
  "documento",
  "empresa",
  "motivo",
  "responsable",
  "estado",
] as const;

export type VisitaReportSortBy = (typeof VISITA_REPORT_SORT_BY)[number];

/** Dirección de ordenación del reporte de visitas. */
export const VISITA_REPORT_SORT_ORDER = ["asc", "desc"] as const;

export type VisitaReportSortOrder = (typeof VISITA_REPORT_SORT_ORDER)[number];

/** Tamaño por defecto de página del reporte. */
export const DEFAULT_VISITAS_REPORT_PAGE_LIMIT = 15;

/** Máximo de registros por página del reporte. */
export const MAX_VISITAS_REPORT_PAGE_LIMIT = 50_000;

/**
 * Filtros y paginación para GET /reports/visitas.
 */
export class ListVisitasReportQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_VISITAS_REPORT_PAGE_LIMIT,
    default: DEFAULT_VISITAS_REPORT_PAGE_LIMIT,
    description: "Visitas per page",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_VISITAS_REPORT_PAGE_LIMIT)
  declare limit?: number;

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
