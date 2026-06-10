/**
 * @file location.response.dto.ts
 * @description DTO de respuesta de una ubicación GLPI.
 */
import { ApiProperty } from "@nestjs/swagger";

/** Representación serializable de una ubicación para la API. */
export class LocationResponseDto {
  @ApiProperty({ example: 12 })
  id!: number;

  @ApiProperty({ example: "Casa Central" })
  name!: string;

  @ApiProperty({ example: "Asunci├│n > Casa Central" })
  fullPath!: string;

  @ApiProperty({ nullable: true })
  building!: string | null;

  @ApiProperty({ nullable: true })
  room!: string | null;
}
