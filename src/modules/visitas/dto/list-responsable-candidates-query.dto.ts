/**
 * @file list-responsable-candidates-query.dto.ts
 * @description DTO de consulta para buscar responsables de visita en usuarios GLPI.
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

/** Límite por defecto de candidatos responsables en búsqueda. */
export const DEFAULT_RESPONSABLE_CANDIDATES_LIMIT = 20;

/** Límite máximo de candidatos responsables en búsqueda. */
export const MAX_RESPONSABLE_CANDIDATES_LIMIT = 50;

/** Parámetros de query para GET /visitas/responsable-candidates. */
export class ListResponsableCandidatesQueryDto {
  @ApiPropertyOptional({ description: "Free-text search by login, name or email" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: "Resolve a single GLPI user by id" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  id?: number;

  @ApiPropertyOptional({ default: DEFAULT_RESPONSABLE_CANDIDATES_LIMIT, maximum: MAX_RESPONSABLE_CANDIDATES_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_RESPONSABLE_CANDIDATES_LIMIT)
  limit?: number;
}
