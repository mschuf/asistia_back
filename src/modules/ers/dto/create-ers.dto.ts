/**
 * @file create-ers.dto.ts
 * @description DTO para crear de forma atómica un ticket y su proyecto ERS completo.
 */
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { ErsTaskInputDto } from "./update-ers.dto";

/** Estado completo requerido por la pantalla de alta de ERS. */
export class CreateErsDto {
  @ApiProperty({ example: 188, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  requesterId!: number;

  @ApiProperty({ example: 8, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  locationId!: number;

  @ApiProperty({ example: "Portal RRHH", minLength: 3, maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  @Matches(/\S/, { message: "projectName must contain visible characters" })
  projectName!: string;

  @ApiProperty({ example: "Reducir tiempos de gestión." })
  @IsString()
  @MinLength(1)
  @Matches(/\S/, { message: "objective must contain visible characters" })
  objective!: string;

  @ApiProperty({ example: "Detalle funcional del requerimiento." })
  @IsString()
  @MinLength(1)
  @Matches(/\S/, { message: "description must contain visible characters" })
  description!: string;

  @ApiPropertyOptional({ example: "Impacta a 250 colaboradores." })
  @IsOptional()
  @IsString()
  impact?: string;

  @ApiPropertyOptional({ example: 80 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  approverId?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  projectStateId?: number;

  @ApiProperty({ type: Number, isArray: true, example: [80, 81] })
  @IsArray()
  @ArrayMaxSize(50)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  teamMemberIds!: number[];

  @ApiProperty({ type: () => [ErsTaskInputDto] })
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ErsTaskInputDto)
  tasks!: ErsTaskInputDto[];
}
