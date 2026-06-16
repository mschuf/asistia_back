/**
 * @file visita-metrics.response.dto.ts
 * @description DTO de respuesta con agregados de visitas para cards de Portería.
 */
import { ApiProperty } from "@nestjs/swagger";

/** Contadores de visitas para el dashboard de Portería. */
export class VisitaMetricsResponseDto {
  @ApiProperty({ example: 30, description: "Visitas con entrada en el mes actual (excluye canceladas)" })
  monthVisits!: number;

  @ApiProperty({ example: 12, description: "Visitas con entrada en el día actual (excluye canceladas)" })
  dayVisits!: number;

  @ApiProperty({ example: 5, description: "Visitas activas con permiso de fabrica" })
  plantVisitors!: number;

  @ApiProperty({ example: 2, description: "Visitas activas con permiso de administracion" })
  adminVisitors!: number;
}
