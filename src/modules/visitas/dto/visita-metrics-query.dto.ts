/**
 * @file visita-metrics-query.dto.ts
 * @description Parámetros de consulta para métricas agregadas de visitas en Portería.
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsISO8601, IsOptional } from "class-validator";

/** Query params de GET /visitas/metrics con rango de entrada opcional. */
export class VisitaMetricsQueryDto {
  @ApiPropertyOptional({ description: "Filter metrics with entrada_at on or after this ISO date" })
  @IsOptional()
  @IsISO8601()
  entradaFrom?: string;

  @ApiPropertyOptional({ description: "Filter metrics with entrada_at on or before this ISO date" })
  @IsOptional()
  @IsISO8601()
  entradaTo?: string;
}
