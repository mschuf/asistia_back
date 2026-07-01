/**
 * @file ticket.response.dto.ts
 * @description DTOs de respuesta para tickets, listados y operaciones de creación/estado.
 */
import { ApiProperty } from "@nestjs/swagger";

/** Actor del ticket (solicitante o técnico) expuesto en la API. */
class TicketActorDto {
  @ApiProperty({ example: 188, nullable: true })
  id!: number | null;

  @ApiProperty({ example: "Juan Pérez", nullable: true })
  name!: string | null;

  @ApiProperty({ example: "jperez@empresa.com", nullable: true })
  email!: string | null;
}

/** Categoría ITIL asociada al ticket. */
class TicketCategoryDto {
  @ApiProperty({ example: 65 })
  id!: number;

  @ApiProperty({ example: "Software: Office, Windows, SAP, Aplicaciones" })
  name!: string;
}

/** Sede (location) del ticket. */
class TicketLocationDto {
  @ApiProperty({ example: 12, nullable: true })
  id!: number | null;

  @ApiProperty({ example: "Casa Central", nullable: true })
  name!: string | null;
}

/** Representación enriquecida de un ticket para la API. */
export class TicketResponseDto {
  @ApiProperty({ example: 10453 })
  id!: number;

  @ApiProperty({ enum: ["incident", "request"] })
  type!: "incident" | "request";

  @ApiProperty({
    enum: ["new", "assigned", "planned", "waiting", "solved", "closed"],
  })
  status!: string;

  @ApiProperty({
    enum: ["very_low", "low", "medium", "high", "very_high"],
  })
  urgency!: string;

  @ApiProperty({ example: "No puedo abrir Outlook" })
  subject!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({ type: () => TicketCategoryDto, nullable: true })
  category!: TicketCategoryDto | null;

  @ApiProperty({ type: () => TicketLocationDto, nullable: true })
  location!: TicketLocationDto | null;

  @ApiProperty({ type: () => TicketActorDto })
  requester!: TicketActorDto;

  @ApiProperty({ type: () => TicketActorDto, nullable: true })
  technician!: TicketActorDto | null;

  @ApiProperty({ example: "2026-05-21T18:02:11Z", nullable: true })
  createdAt!: string | null;

  @ApiProperty({ example: "2026-05-21T18:02:11Z", nullable: true })
  updatedAt!: string | null;

  @ApiProperty({ example: "2026-05-21T18:02:11Z", nullable: true })
  solvedAt!: string | null;

  @ApiProperty({ example: "2026-05-21T18:02:11Z", nullable: true })
  closedAt!: string | null;
}

/** Respuesta mínima de PATCH /tickets/:id/status. */
export class UpdateTicketStatusResponseDto {
  @ApiProperty({ example: 10453 })
  id!: number;

  @ApiProperty({
    enum: ["new", "assigned", "planned", "waiting", "solved", "closed"],
  })
  status!: string;
}

/** Respuesta mínima de POST /tickets (sin enriquecimiento GLPI). */
export class CreateTicketResponseDto {
  @ApiProperty({ example: 10453 })
  id!: number;

  @ApiProperty({ example: "No puedo abrir Outlook" })
  subject!: string;

  @ApiProperty({
    description: "Indica si hay destinatarios para el correo de creación.",
    example: { sent: true, error: null },
  })
  mail!: { sent: boolean; error: string | null };
}

/** Listado paginado de tickets. */
export class TicketListResponseDto {
  @ApiProperty({ type: () => [TicketResponseDto] })
  items!: TicketResponseDto[];

  @ApiProperty({ example: 124 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 25 })
  limit!: number;
}
