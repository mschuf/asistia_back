/**
 * @file responsable-candidate.response.dto.ts
 * @description DTOs de respuesta para candidatos responsables de visita (usuarios GLPI).
 */
import { ApiProperty } from "@nestjs/swagger";

/** Candidato responsable activo en GLPI para el selector de visitas. */
export class ResponsableCandidateResponseDto {
  @ApiProperty({ example: 188, description: "GLPI user id" })
  id!: number;

  @ApiProperty({ example: "Juan Pérez" })
  fullName!: string;

  @ApiProperty({ example: "Planta Norte", description: "Ubicación GLPI del usuario" })
  subtitle!: string;
}

/** Contenedor de resultados de búsqueda de responsables GLPI. */
export class ResponsableCandidateListResponseDto {
  @ApiProperty({ type: () => [ResponsableCandidateResponseDto] })
  items!: ResponsableCandidateResponseDto[];

  @ApiProperty({ example: 12 })
  total!: number;
}
