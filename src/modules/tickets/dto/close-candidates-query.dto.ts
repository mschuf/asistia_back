/**
 * @file close-candidates-query.dto.ts
 * @description Parámetros de consulta para GET /tickets/close-candidates (super admin).
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsISO8601, IsOptional, IsString } from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";

/** Columnas ordenables en GET /tickets/close-candidates. */
export const CLOSE_CANDIDATES_SORT_BY = [
  "id",
  "createdAt",
  "subject",
  "requester",
  "location",
  "status",
] as const;

export type CloseCandidatesSortBy = (typeof CLOSE_CANDIDATES_SORT_BY)[number];

/** Dirección de ordenación de close-candidates. */
export const CLOSE_CANDIDATES_SORT_ORDER = ["asc", "desc"] as const;

export type CloseCandidatesSortOrder = (typeof CLOSE_CANDIDATES_SORT_ORDER)[number];

/**
 * Filtros y paginación para GET /tickets/close-candidates.
 */
export class CloseCandidatesQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    description: "Incluir tickets abiertos (nuevo, asignado, planificado, en espera)",
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => ["true", "1", "yes", true].includes(value))
  @IsBoolean()
  includeOpen?: boolean;

  @ApiPropertyOptional({ description: "Incluir tickets resueltos", type: Boolean })
  @IsOptional()
  @Transform(({ value }) => ["true", "1", "yes", true].includes(value))
  @IsBoolean()
  includeSolved?: boolean;

  @ApiPropertyOptional({ description: "Filtra tickets creados desde esta fecha ISO (inclusive)" })
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @ApiPropertyOptional({ description: "Filtra tickets creados hasta esta fecha ISO (inclusive)" })
  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  @ApiPropertyOptional({ description: "Búsqueda libre por ID, asunto o descripción" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: CLOSE_CANDIDATES_SORT_BY, description: "Columna de ordenación" })
  @IsOptional()
  @IsIn(CLOSE_CANDIDATES_SORT_BY)
  sortBy?: CloseCandidatesSortBy;

  @ApiPropertyOptional({ enum: CLOSE_CANDIDATES_SORT_ORDER, description: "Dirección de ordenación" })
  @IsOptional()
  @IsIn(CLOSE_CANDIDATES_SORT_ORDER)
  sortOrder?: CloseCandidatesSortOrder;
}
