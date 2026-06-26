/**
 * @file escalar-ticket.dto.ts
 * @description DTO para la transacción 1 de escalado ticket -> proyecto ERS.
 */
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";

/** Payload de creación inicial del ERS desde un ticket. */
export class EscalarTicketDto {
  @ApiProperty({ example: 1254, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  ticketId!: number;

  @ApiProperty({
    example: "Implementación portal de autoservicio RRHH",
    minLength: 3,
    maxLength: 255,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(255)
  projectName!: string;

  @ApiPropertyOptional({ example: "Reducir el tiempo de respuesta del área RRHH." })
  @IsOptional()
  @IsString()
  objective?: string;

  @ApiPropertyOptional({ example: "Se requiere una interfaz web y notificaciones automáticas." })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: "Afecta directamente a 250 usuarios de sede central." })
  @IsOptional()
  @IsString()
  impact?: string;

  @ApiProperty({
    type: Number,
    isArray: true,
    example: [34, 51],
    description: "IDs de técnicos responsables de puesta en marcha",
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  responsibleIds!: number[];
}

