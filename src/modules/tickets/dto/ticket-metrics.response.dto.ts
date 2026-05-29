import { ApiProperty } from "@nestjs/swagger";

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

class OpenByLocationDto {
  @ApiProperty({ example: 12 })
  locationId!: number;

  @ApiProperty({ example: "Casa Central" })
  name!: string;

  @ApiProperty({ example: 8 })
  open!: number;
}

export class TicketMetricsResponseDto {
  @ApiProperty({ type: MyTicketsMetricSliceDto })
  myTickets!: MyTicketsMetricSliceDto;

  @ApiProperty({ type: TicketMetricSliceDto, nullable: true })
  mySite!: TicketMetricSliceDto | null;

  @ApiProperty({ type: TicketMetricSliceDto })
  myIncidents!: TicketMetricSliceDto;

  @ApiProperty({ type: TicketMetricSliceDto })
  myRequests!: TicketMetricSliceDto;

  @ApiProperty({ type: [OpenByLocationDto] })
  openByLocation!: OpenByLocationDto[];
}
