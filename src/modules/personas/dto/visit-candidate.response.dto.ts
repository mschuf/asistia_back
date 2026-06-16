/**
 * @file visit-candidate.response.dto.ts
 * @description DTOs de respuesta para candidatos de persona en el selector de visitas.
 */
import { ApiProperty } from "@nestjs/swagger";

/** Origen del candidato en la búsqueda unificada. */
export const VISIT_CANDIDATE_SOURCE = ["postgres", "glpi"] as const;

export type VisitCandidateSource = (typeof VISIT_CANDIDATE_SOURCE)[number];

/** Candidato unificado para el selector de persona en visitas. */
export class VisitCandidateResponseDto {
  @ApiProperty({ enum: VISIT_CANDIDATE_SOURCE, example: "postgres" })
  source!: VisitCandidateSource;

  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: "Maria Gonzalez" })
  fullName!: string;

  @ApiProperty({ example: "30.123.456", description: "Documento (Postgres) o ubicación (GLPI)" })
  subtitle!: string;
}

/** Contenedor de resultados de búsqueda de candidatos para visitas. */
export class VisitCandidateListResponseDto {
  @ApiProperty({ type: () => [VisitCandidateResponseDto] })
  items!: VisitCandidateResponseDto[];

  @ApiProperty({ example: 12 })
  total!: number;
}
