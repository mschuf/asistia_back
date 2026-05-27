import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import { TICKET_TYPE, type TicketType } from "../domain/ticket-type";

export class CreateTicketDto {
  @ApiProperty({ enum: Object.values(TICKET_TYPE), example: "incident" })
  @IsEnum(Object.values(TICKET_TYPE) as readonly string[])
  type!: TicketType;

  @ApiProperty({ example: "No puedo abrir Outlook", minLength: 3, maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  subject!: string;

  @ApiProperty({ example: "Outlook devuelve el error 0x80004005 al iniciar.", minLength: 10 })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  description!: string;

  @ApiProperty({ example: 65 })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  categoryId!: number;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  locationId?: number;

  @ApiPropertyOptional({ example: 47, description: "Technician to assign on creation" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  assignedTechnicianId?: number;

  @ApiPropertyOptional({
    example: 188,
    description: "Override requester id. Only allowed for technicians.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  requesterId?: number;
}
