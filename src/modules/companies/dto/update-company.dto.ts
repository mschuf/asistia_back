/**
 * @file update-company.dto.ts
 * @description DTO de validación para actualización parcial de una empresa.
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
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

/** Cuerpo HTTP con campos opcionales para modificar una empresa existente. */
export class UpdateCompanyDto {
  @ApiPropertyOptional({ example: "Pettengill" })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  msTenantId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  msClientId?: string;

  @ApiPropertyOptional({ description: "Leave empty to keep the current secret" })
  @IsOptional()
  @IsString()
  @MinLength(8)
  msClientSecret?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  msMailbox?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  msMailFolder?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  geminiModel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  daemonMaxEmails?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  daemonIntervalSeconds?: number;
}
