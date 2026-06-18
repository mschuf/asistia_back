/**
 * @file list-porteria-audit-query.dto.ts
 * @description Parámetros de consulta del reporte superadmin de auditoría de portería.
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, Min } from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";
import { VISITA_ESTADO, type VisitaEstado } from "../../visitas/domain/visita-estado";
import {
  VISITA_AUDIT_ACTION,
  VISITA_AUDIT_SORT_BY,
  type VisitaAuditAction,
  type VisitaAuditSortBy,
  type VisitaAuditSortOrder,
} from "../../visitas/visitas.types";

/** Dirección de ordenación para auditoría de portería. */
export const VISITA_AUDIT_SORT_ORDER = ["asc", "desc"] as const;

/** Límite por defecto en auditoría de portería. */
export const DEFAULT_PORTERIA_AUDIT_PAGE_LIMIT = 15;
/** Límite máximo de página en auditoría de portería. */
export const MAX_PORTERIA_AUDIT_PAGE_LIMIT = 200;

/** Query DTO para GET /reports/porteria-audit. */
export class ListPorteriaAuditQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_PORTERIA_AUDIT_PAGE_LIMIT,
    default: DEFAULT_PORTERIA_AUDIT_PAGE_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PORTERIA_AUDIT_PAGE_LIMIT)
  declare limit?: number;

  @ApiPropertyOptional({ description: "Búsqueda general (acción, visita, actor, visitante, documento...)" })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ enum: VISITA_AUDIT_ACTION })
  @IsOptional()
  @IsIn(VISITA_AUDIT_ACTION)
  action?: VisitaAuditAction;

  @ApiPropertyOptional({ description: "ID del actor (usuario GLPI) que realizó la acción" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  actorUserId?: number;

  @ApiPropertyOptional({ description: "ID de visita" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  visitaId?: number;

  @ApiPropertyOptional({ description: "Filtro por visitante (coincidencia parcial)" })
  @IsOptional()
  @IsString()
  visitante?: string;

  @ApiPropertyOptional({ description: "Filtro por documento (coincidencia parcial)" })
  @IsOptional()
  @IsString()
  documento?: string;

  @ApiPropertyOptional({ description: "Fecha/hora mínima del evento (ISO8601)" })
  @IsOptional()
  @IsISO8601()
  occurredFrom?: string;

  @ApiPropertyOptional({ description: "Fecha/hora máxima del evento (ISO8601)" })
  @IsOptional()
  @IsISO8601()
  occurredTo?: string;

  @ApiPropertyOptional({ enum: VISITA_ESTADO, description: "Estado previo" })
  @IsOptional()
  @IsIn(VISITA_ESTADO)
  estadoBefore?: VisitaEstado;

  @ApiPropertyOptional({ enum: VISITA_ESTADO, description: "Estado posterior" })
  @IsOptional()
  @IsIn(VISITA_ESTADO)
  estadoAfter?: VisitaEstado;

  @ApiPropertyOptional({ enum: VISITA_AUDIT_SORT_BY, description: "Columna para ordenar" })
  @IsOptional()
  @IsIn(VISITA_AUDIT_SORT_BY)
  sortBy?: VisitaAuditSortBy;

  @ApiPropertyOptional({ enum: VISITA_AUDIT_SORT_ORDER, description: "Dirección de ordenación" })
  @IsOptional()
  @IsIn(VISITA_AUDIT_SORT_ORDER)
  sortOrder?: VisitaAuditSortOrder;
}
