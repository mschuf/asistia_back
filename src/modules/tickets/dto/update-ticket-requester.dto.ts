/**
 * @file update-ticket-requester.dto.ts
 * @description DTO para cambiar el solicitante de un ticket.
 */
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsPositive } from "class-validator";

/**
 * Payload de PATCH /tickets/:id/requester.
 */
export class UpdateTicketRequesterDto {
  @ApiProperty({ example: 42, description: "GLPI user id of the new requester" })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  requesterId!: number;
}
