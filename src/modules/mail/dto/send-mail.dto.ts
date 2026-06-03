import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsPositive,
  IsString,
  MinLength,
} from "class-validator";

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
}
