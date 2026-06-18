/**
 * @file visita-metrics.response.dto.ts
 * @description DTO de respuesta con agregados de visitas para cards de Portería.
 */
import { ApiProperty } from "@nestjs/swagger";

/** Contadores de visitas para el dashboard de Portería. */
export class VisitaMetricsResponseDto {
  @ApiProperty({ example: 30, description: "Ingresos registrados en el mes actual (excluye canceladas)" })
  monthVisits!: number;

  @ApiProperty({ example: 12, description: "Ingresos registrados en el día actual (excluye canceladas)" })
  dayVisits!: number;

  @ApiProperty({ example: 2, description: "Visitas activas con tarjeta roja (solo administración)" })
  activeOnlyAdmin!: number;

  @ApiProperty({ example: 1, description: "Visitas activas con tarjeta amarilla (fábrica)" })
  activeOnlyFactory!: number;

  @ApiProperty({ example: 2, description: "Visitas activas con tarjeta verde (fábrica y administración)" })
  activeBothZones!: number;

  @ApiProperty({
    example: 0,
    description: "Visitas activas del mes cuyo ingreso fue en un día anterior (sin salida registrada)",
  })
  activeStaleWithoutCheckout!: number;
}
