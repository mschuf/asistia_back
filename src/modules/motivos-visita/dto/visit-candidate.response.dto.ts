/**
 * @file visit-candidate.response.dto.ts
 * @description DTOs de respuesta para candidatos de motivo en el selector de visitas.
 */
import { ApiProperty } from "@nestjs/swagger";

/** Candidato de motivo activo para el selector de visitas. */
export class MotivoVisitCandidateResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: "Mantenimiento preventivo" })
  fullName!: string;

  @ApiProperty({ example: "", description: "Subtítulo opcional del candidato" })
  subtitle!: string;
}

/** Contenedor de resultados de búsqueda de candidatos para visitas. */
export class MotivoVisitCandidateListResponseDto {
  @ApiProperty({ type: () => [MotivoVisitCandidateResponseDto] })
  items!: MotivoVisitCandidateResponseDto[];

  @ApiProperty({ example: 10 })
  total!: number;
}
