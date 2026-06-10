/**
 * @file update-ticket-location.dto.ts
 * @description DTO para cambiar la sede (location) de un ticket.
 */
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsPositive } from "class-validator";

/**
 * Payload de PATCH /tickets/:id/location.
 */
export class UpdateTicketLocationDto {
  @ApiProperty({ example: 12, description: "Ticket location (sede) id" })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  locationId!: number;
}
