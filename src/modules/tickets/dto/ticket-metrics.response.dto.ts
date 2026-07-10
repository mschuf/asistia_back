/**
 * @file ticket-metrics.response.dto.ts
 * @description DTOs de métricas agregadas de tickets para el dashboard del usuario.
 */
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/** Métricas de un segmento (incidentes, solicitudes, sede). */
class TicketMetricSliceDto {
  @ApiProperty({ example: 5 })
  open!: number;

  @ApiProperty({ example: 42, description: "Abiertos del mes / total del mes × 100" })
  openPercent!: number;

  @ApiProperty({ example: 3 })
  openThisMonth!: number;

  @ApiProperty({ example: 7 })
  totalThisMonth!: number;
}

/** Conteo global de tickets pendientes de asignación humana. */
class UnassignedMetricDto {
  @ApiProperty({ example: 12, description: "Tickets abiertos de cualquier fecha" })
  open!: number;
}

/** Métricas de "Mis tickets" para técnicos (incluye en progreso). */
class MyTicketsMetricSliceDto {
  @ApiProperty({ example: 5, description: "Tickets abiertos asignados al técnico (incluye new)" })
  inProgress!: number;

  @ApiProperty({ example: 42 })
  openPercent!: number;

  @ApiProperty({ example: 3 })
  openThisMonth!: number;

  @ApiProperty({ example: 7 })
  totalThisMonth!: number;
}

/** Fila de tickets abiertos agrupados por sede. */
class OpenByLocationDto {
  @ApiProperty({ example: 12 })
  locationId!: number;

  @ApiProperty({ example: "Casa Central" })
  name!: string;

  @ApiProperty({ example: 8 })
  open!: number;
}

/** Fila de tickets abiertos agrupados por técnico asignado. */
class OpenByAssigneeDto {
  @ApiProperty({ example: 42 })
  technicianId!: number;

  @ApiProperty({ example: "Juan Pérez" })
  name!: string;

  @ApiProperty({ example: 5 })
  open!: number;
}

/** Respuesta de GET /tickets/metrics. */
export class TicketMetricsResponseDto {
  @ApiProperty({ type: MyTicketsMetricSliceDto })
  myTickets!: MyTicketsMetricSliceDto;

  @ApiProperty({ type: TicketMetricSliceDto, nullable: true })
  mySite!: TicketMetricSliceDto | null;

  @ApiProperty({ type: TicketMetricSliceDto })
  myIncidents!: TicketMetricSliceDto;

  @ApiProperty({ type: TicketMetricSliceDto })
  myRequests!: TicketMetricSliceDto;

  @ApiProperty({
    type: TicketMetricSliceDto,
    description: "Tickets abiertos del equipo (historial: Estado Abiertos, sin filtros de actor/sede)",
  })
  myGroup!: TicketMetricSliceDto;

  @ApiPropertyOptional({
    type: UnassignedMetricDto,
    description: "Tickets abiertos asignados al usuario de servicio asistIA (solo usuarios TI)",
  })
  unassigned?: UnassignedMetricDto;

  @ApiProperty({ type: TicketMetricSliceDto })
  mySolved!: TicketMetricSliceDto;

  @ApiProperty({ type: TicketMetricSliceDto })
  myClosed!: TicketMetricSliceDto;

  @ApiProperty({ type: [OpenByLocationDto] })
  openByLocation!: OpenByLocationDto[];

  @ApiProperty({ type: [OpenByAssigneeDto] })
  openByAssignee!: OpenByAssigneeDto[];
}
