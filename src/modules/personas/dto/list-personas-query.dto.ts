/**
 * @file list-personas-query.dto.ts
 * @description DTO de consulta para listar personas con paginación, filtros y orden.
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";

/** Columnas ordenables en GET /personas. */
export const PERSONA_SORT_BY = [
  "id",
  "nombre",
  "documento",
  "proveedorNombre",
  "createdAt",
] as const;

export type PersonaSortBy = (typeof PERSONA_SORT_BY)[number];

/** Dirección de ordenación del listado de personas. */
export const PERSONA_SORT_ORDER = ["asc", "desc"] as const;

export type PersonaSortOrder = (typeof PERSONA_SORT_ORDER)[number];

/** Parámetros de query para el listado paginado de personas. */
export class ListPersonasQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: "Free-text search in id, nombre, documento, proveedor, email" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: "Filter by nombre" })
  @IsOptional()
  @IsString()
  nombre?: string;

  @ApiPropertyOptional({ description: "Filter by documento" })
  @IsOptional()
  @IsString()
  documento?: string;

  @ApiPropertyOptional({ description: "Filter by proveedor nombre (partial match)" })
  @IsOptional()
  @IsString()
  proveedor?: string;

  @ApiPropertyOptional({ description: "Filter by proveedor id" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  proveedorId?: number;

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

  @ApiPropertyOptional({ enum: PERSONA_SORT_BY, description: "Column to sort by" })
  @IsOptional()
  @IsIn(PERSONA_SORT_BY)
  sortBy?: PersonaSortBy;

  @ApiPropertyOptional({ enum: PERSONA_SORT_ORDER, description: "Sort direction (asc or desc)" })
  @IsOptional()
  @IsIn(PERSONA_SORT_ORDER)
  sortOrder?: PersonaSortOrder;
}

/** Límite por defecto de registros por página en listados de personas. */
export const DEFAULT_PERSONAS_PAGE_LIMIT = 15;
