/**
 * @file visit-candidate.response.dto.ts
 * @description DTOs de respuesta para candidatos de persona en el selector de visitas.
 */
import { ApiProperty } from "@nestjs/swagger";

/** Candidato de persona activa para el selector de visitas. */
export class VisitCandidateResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: "Maria Gonzalez" })
  fullName!: string;

  @ApiProperty({ example: "30.123.456", description: "Documento de la persona" })
  subtitle!: string;
}

/** Contenedor de resultados de búsqueda de candidatos para visitas. */
export class VisitCandidateListResponseDto {
  @ApiProperty({ type: () => [VisitCandidateResponseDto] })
  items!: VisitCandidateResponseDto[];

  @ApiProperty({ example: 12 })
  total!: number;
}
