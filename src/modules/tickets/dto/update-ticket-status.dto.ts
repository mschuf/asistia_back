import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { TICKET_STATUS, type TicketStatus } from "../domain/ticket-status";

export const RESOLUTION_NOTE_MIN_LENGTH = 3;

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
