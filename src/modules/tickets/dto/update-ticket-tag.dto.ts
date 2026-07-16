/**
 * @file update-ticket-tag.dto.ts
 * @description DTO de validación para actualizar el tag (glpi_tickets.name) de un ticket.
 */
import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength } from "class-validator";

/**
 * Payload de PATCH /tickets/:id/tag. Cadena vacía limpia el tag.
 */
export class UpdateTicketTagDto {
  @ApiProperty({
    example: "URGENTE",
    maxLength: 15,
    description: "Tag corto almacenado en glpi_tickets.name. Cadena vacía lo limpia.",
  })
  @IsString()
  @MaxLength(15)
  tag!: string;
}
