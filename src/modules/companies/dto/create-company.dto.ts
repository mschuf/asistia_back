/**
 * @file create-company.dto.ts
 * @description DTO de validación para la creación de una empresa.
 */
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

/** Cuerpo HTTP para crear una empresa con integración Microsoft y daemon. */
export class CreateCompanyDto {
  @ApiProperty({ example: "Pettengill" })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ example: "00000000-0000-0000-0000-000000000001" })
  @IsUUID()
  msTenantId!: string;

  @ApiProperty({ example: "00000000-0000-0000-0000-000000000002" })
  @IsUUID()
  msClientId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  msClientSecret!: string;

  @ApiProperty({ example: "soporte@empresa.com" })
  @IsEmail()
  @MaxLength(320)
  msMailbox!: string;

  @ApiPropertyOptional({ default: "inbox" })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  msMailFolder?: string;

  @ApiPropertyOptional({ default: "gemini-3-flash-preview" })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  geminiModel?: string;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  daemonMaxEmails?: number;

  @ApiPropertyOptional({ default: 60 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  daemonIntervalSeconds?: number;
}
