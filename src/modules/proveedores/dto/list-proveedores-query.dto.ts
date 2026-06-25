/**
 * @file list-proveedores-query.dto.ts
 * @description DTO de consulta para listar proveedores con paginación, filtros y orden.
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";

/** Columnas ordenables en GET /proveedores. */
export const PROVEEDOR_SORT_BY = ["id", "nombre", "ruc", "createdAt"] as const;

export type ProveedorSortBy = (typeof PROVEEDOR_SORT_BY)[number];

/** Dirección de ordenación del listado de proveedores. */
export const PROVEEDOR_SORT_ORDER = ["asc", "desc"] as const;

export type ProveedorSortOrder = (typeof PROVEEDOR_SORT_ORDER)[number];

/** Parámetros de query para el listado paginado de proveedores. */
export class ListProveedoresQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: "Free-text search in id, nombre, ruc" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: "Filter by nombre" })
  @IsOptional()
  @IsString()
  nombre?: string;

  @ApiPropertyOptional({ description: "Filter by RUC" })
  @IsOptional()
  @IsString()
  ruc?: string;

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

  @ApiPropertyOptional({ enum: PROVEEDOR_SORT_BY, description: "Column to sort by" })
  @IsOptional()
  @IsIn(PROVEEDOR_SORT_BY)
  sortBy?: ProveedorSortBy;

  @ApiPropertyOptional({ enum: PROVEEDOR_SORT_ORDER, description: "Sort direction (asc or desc)" })
  @IsOptional()
  @IsIn(PROVEEDOR_SORT_ORDER)
  sortOrder?: ProveedorSortOrder;
}

/** Límite por defecto de registros por página en listados de proveedores. */
export const DEFAULT_PROVEEDORES_PAGE_LIMIT = 15;
