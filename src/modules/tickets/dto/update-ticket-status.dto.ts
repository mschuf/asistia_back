/**
 * @file update-ticket-status.dto.ts
 * @description DTO para actualizar el estado de un ticket y opcionalmente la nota de resolución.
 */
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { TICKET_STATUS, type TicketStatus } from "../domain/ticket-status";

/** Longitud mínima de la nota de resolución al marcar como resuelto. */
export const RESOLUTION_NOTE_MIN_LENGTH = 3;

/**
 * Payload de PATCH /tickets/:id/status.
 */
export class UpdateTicketStatusDto {
  @ApiProperty({ enum: Object.values(TICKET_STATUS), example: "solved" })
  @IsEnum(Object.values(TICKET_STATUS) as readonly string[])
  status!: TicketStatus;

  @ApiPropertyOptional({
    example: "Se reinstaló Outlook y se verificó el acceso al buzón.",
    description:
      "Texto de lo realizado (técnicos al marcar resuelto). Se concatena tras // en GLPI.",
    minLength: RESOLUTION_NOTE_MIN_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MinLength(RESOLUTION_NOTE_MIN_LENGTH)
  resolutionNote?: string;
}
