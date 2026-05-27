import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";
import { TICKET_STATUS, type TicketStatus } from "../domain/ticket-status";

export class UpdateTicketStatusDto {
  @ApiProperty({ enum: Object.values(TICKET_STATUS), example: "solved" })
  @IsEnum(Object.values(TICKET_STATUS) as readonly string[])
  status!: TicketStatus;
}
