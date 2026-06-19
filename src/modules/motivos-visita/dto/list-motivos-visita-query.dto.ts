/**
 * @file list-motivos-visita-query.dto.ts
 * @description DTO de consulta para listar motivos de visita con paginación, filtros y orden.
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";

/** Columnas ordenables en GET /motivos-visita. */
export const MOTIVO_VISITA_SORT_BY = ["id", "nombre", "createdAt"] as const;

export type MotivoVisitaSortBy = (typeof MOTIVO_VISITA_SORT_BY)[number];

/** Dirección de ordenación del listado de motivos de visita. */
export const MOTIVO_VISITA_SORT_ORDER = ["asc", "desc"] as const;

export type MotivoVisitaSortOrder = (typeof MOTIVO_VISITA_SORT_ORDER)[number];

/** Parámetros de query para el listado paginado de motivos de visita. */
export class ListMotivosVisitaQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: "Free-text search in id, nombre" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: "Filter by nombre" })
  @IsOptional()
  @IsString()
  nombre?: string;

  @ApiPropertyOptional({ description: "Filter by active status" })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === "") return undefined;
    if (value === true || value === "true" || value === "1") return true;
    if (value === false || value === "false" || value === "0") return false;
    return value;
  })
  @IsBoolean()
  activo?: boolean;

  @ApiPropertyOptional({ enum: MOTIVO_VISITA_SORT_BY, description: "Column to sort by" })
  @IsOptional()
  @IsIn(MOTIVO_VISITA_SORT_BY)
  sortBy?: MotivoVisitaSortBy;

  @ApiPropertyOptional({ enum: MOTIVO_VISITA_SORT_ORDER, description: "Sort direction (asc or desc)" })
  @IsOptional()
  @IsIn(MOTIVO_VISITA_SORT_ORDER)
  sortOrder?: MotivoVisitaSortOrder;
}

/** Límite por defecto de registros por página en listados de motivos de visita. */
export const DEFAULT_MOTIVOS_VISITA_PAGE_LIMIT = 15;
