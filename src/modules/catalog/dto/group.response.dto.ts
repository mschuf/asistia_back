/**
 * @file group.response.dto.ts
 * @description DTO de respuesta de un grupo GLPI.
 */
import { ApiProperty } from "@nestjs/swagger";

/** Representación serializable de un grupo para la API. */
export class GroupResponseDto {
  @ApiProperty({ example: 4 })
  id!: number;

  @ApiProperty({ example: "TI" })
  name!: string;

  @ApiProperty({ example: "TI > Soporte" })
  fullPath!: string;

  @ApiProperty({ nullable: true })
  description!: string | null;
}
