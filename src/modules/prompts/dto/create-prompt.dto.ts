/**
 * @file create-prompt.dto.ts
 * @description DTO de validación para la creación de un prompt por empresa.
 */
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsNotEmpty, IsPositive, IsString } from "class-validator";

/** Cuerpo HTTP para crear un prompt de IA asociado a una empresa. */
export class CreatePromptDto {
  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  companyId!: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  systemInstruction!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  promptTemplate!: string;
}
