/**
 * @file ticket-created-log.response.dto.ts
 * @description DTOs de respuesta del reporte de logs ticket.created.
 */
import { ApiProperty } from "@nestjs/swagger";

/** Fila del reporte de tickets creados por IA. */
export class TicketCreatedLogResponseDto {
  @ApiProperty({ example: "2026-06-10T14:30:00.000Z" })
  createdAt!: string;

  @ApiProperty({ example: "Pettengill" })
  company!: string;

  @ApiProperty({ nullable: true, example: "Problema con impresora" })
  subject!: string | null;

  @ApiProperty({ nullable: true, example: "usuario@empresa.com" })
  fromAddress!: string | null;

  @ApiProperty({ nullable: true, example: "usuario@empresa.com" })
  requesterEmail!: string | null;

  @ApiProperty({ nullable: true, example: "incident" })
  type!: string | null;

  @ApiProperty({ nullable: true, example: "Hardware > Impresoras" })
  category!: string | null;

  @ApiProperty({ nullable: true, example: "true" })
  mailSent!: string | null;

  @ApiProperty({ nullable: true, example: "201" })
  httpStatus!: string | null;
}

/** Contenedor paginado del reporte ticket.created. */
export class TicketCreatedLogListResponseDto {
  @ApiProperty({ type: () => [TicketCreatedLogResponseDto] })
  items!: TicketCreatedLogResponseDto[];

  @ApiProperty({ example: 120 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 15 })
  limit!: number;
}
