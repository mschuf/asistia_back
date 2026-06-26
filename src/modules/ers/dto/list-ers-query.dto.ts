/**
 * @file list-ers-query.dto.ts
 * @description DTO de consulta para listado paginado de ERS.
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";

/** Columnas ordenables del listado de ERS. */
export const ERS_SORT_BY = [
  "projectId",
  "projectName",
  "ticketId",
  "requesterName",
  "locationName",
  "stateName",
  "progress",
  "updatedAt",
] as const;

export type ErsSortBy = (typeof ERS_SORT_BY)[number];

/** Dirección de ordenamiento del listado de ERS. */
export const ERS_SORT_ORDER = ["asc", "desc"] as const;

export type ErsSortOrder = (typeof ERS_SORT_ORDER)[number];

/** Query params de `GET /ers`. */
export class ListErsQueryDto extends PaginationDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 50_000, default: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50_000)
  declare limit?: number;

  @ApiPropertyOptional({ description: "Búsqueda global" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requesterName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  locationName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  approverName?: string;

  @ApiPropertyOptional({ type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  projectStateId?: number;

  @ApiPropertyOptional({ enum: ERS_SORT_BY })
  @IsOptional()
  @IsIn(ERS_SORT_BY)
  sortBy?: ErsSortBy;

  @ApiPropertyOptional({ enum: ERS_SORT_ORDER })
  @IsOptional()
  @IsIn(ERS_SORT_ORDER)
  sortOrder?: ErsSortOrder;
}

