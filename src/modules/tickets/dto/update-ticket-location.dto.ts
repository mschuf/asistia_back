import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsPositive } from "class-validator";

export class UpdateTicketLocationDto {
  @ApiProperty({ example: 12, description: "Ticket location (sede) id" })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  locationId!: number;
}
