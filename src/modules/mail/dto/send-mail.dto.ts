import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  MinLength,
} from "class-validator";
import { TICKET_TYPE, type TicketType } from "../../tickets/domain/ticket-type";

export class SendMailDto {
  @ApiProperty({ example: "usuario@empresa.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({
    example: "No puedo acceder a Outlook desde la mañana.",
    minLength: 10,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  description!: string;

  @ApiProperty({ example: 65 })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  categoryId!: number;

  @ApiPropertyOptional({ enum: Object.values(TICKET_TYPE), example: "request" })
  @IsOptional()
  @IsEnum(Object.values(TICKET_TYPE) as readonly string[])
  type?: TicketType;
}
