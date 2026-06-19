/**
 * @file list-visit-candidates-query.dto.ts
 * @description DTO de consulta para buscar candidatos de motivo en visitas.
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

/** Límite por defecto de candidatos en búsqueda de visitas. */
export const DEFAULT_MOTIVO_VISIT_CANDIDATES_LIMIT = 20;

/** Límite máximo de candidatos en búsqueda de visitas. */
export const MAX_MOTIVO_VISIT_CANDIDATES_LIMIT = 50;

/** Parámetros de query para GET /motivos-visita/visit-candidates. */
export class ListMotivoVisitCandidatesQueryDto {
  @ApiPropertyOptional({ description: "Free-text search by nombre" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: DEFAULT_MOTIVO_VISIT_CANDIDATES_LIMIT, maximum: MAX_MOTIVO_VISIT_CANDIDATES_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_MOTIVO_VISIT_CANDIDATES_LIMIT)
  limit?: number;
}
