/**
 * @file list-visitas-query.dto.ts
 * @description DTO de consulta para listar visitas con paginación, filtros y orden.
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsString, Min } from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";
import { VISITA_ESTADO, type VisitaEstado } from "../domain/visita-estado";

/** Columnas ordenables en GET /visitas. */
export const VISITA_SORT_BY = [
  "id",
  "visitante",
  "documento",
  "empresa",
  "motivo",
  "responsable",
  "estado",
  "entradaAt",
  "salidaAt",
] as const;

export type VisitaSortBy = (typeof VISITA_SORT_BY)[number];

/** Dirección de ordenación del listado de visitas. */
export const VISITA_SORT_ORDER = ["asc", "desc"] as const;

export type VisitaSortOrder = (typeof VISITA_SORT_ORDER)[number];

/** Parámetros de query para el listado paginado de visitas. */
export class ListVisitasQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: "Free-text search across visita and persona fields" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: "Filter by visitante (persona nombre)" })
  @IsOptional()
  @IsString()
  visitante?: string;

  @ApiPropertyOptional({ description: "Filter by documento" })
  @IsOptional()
  @IsString()
  documento?: string;

  @ApiPropertyOptional({ description: "Filter by empresa" })
  @IsOptional()
  @IsString()
  empresa?: string;

  @ApiPropertyOptional({ description: "Filter by motivo" })
  @IsOptional()
  @IsString()
  motivo?: string;

  @ApiPropertyOptional({ description: "Filter by responsable" })
  @IsOptional()
  @IsString()
  responsable?: string;

  @ApiPropertyOptional({ enum: VISITA_ESTADO })
  @IsOptional()
  @IsIn(VISITA_ESTADO)
  estado?: VisitaEstado;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  personaId?: number;

  @ApiPropertyOptional({ description: "Filter visits with entrada_at on or after this ISO date" })
  @IsOptional()
  @IsISO8601()
  entradaFrom?: string;

  @ApiPropertyOptional({ description: "Filter visits with entrada_at on or before this ISO date" })
  @IsOptional()
  @IsISO8601()
  entradaTo?: string;

  @ApiPropertyOptional({
    description:
      "When true with entradaFrom/entradaTo, also include programada visits without entrada_at created in that range",
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === "") return undefined;
    if (value === true || value === "true" || value === "1") return true;
    if (value === false || value === "false" || value === "0") return false;
    return value;
  })
  @IsBoolean()
  includeProgramadasSinEntrada?: boolean;

  @ApiPropertyOptional({ enum: VISITA_SORT_BY, description: "Column to sort by" })
  @IsOptional()
  @IsIn(VISITA_SORT_BY)
  sortBy?: VisitaSortBy;

  @ApiPropertyOptional({ enum: VISITA_SORT_ORDER, description: "Sort direction (asc or desc)" })
  @IsOptional()
  @IsIn(VISITA_SORT_ORDER)
  sortOrder?: VisitaSortOrder;
}

/** Límite por defecto de registros por página en listados de visitas. */
export const DEFAULT_VISITAS_PAGE_LIMIT = 15;
