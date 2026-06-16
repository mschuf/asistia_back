/**
 * @file glpi-persona-preview.response.dto.ts
 * @description DTO de respuesta con datos precargables desde un usuario GLPI.
 */
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/** Vista previa de persona derivada de un usuario GLPI, sin persistir. */
export class GlpiPersonaPreviewResponseDto {
  @ApiProperty({ example: 188 })
  glpiUserId!: number;

  @ApiProperty({ example: "Juan Pérez" })
  nombre!: string;

  @ApiProperty({ example: "" })
  documento!: string;

  @ApiPropertyOptional({ nullable: true, example: "jperez@empresa.com" })
  email!: string | null;

  @ApiPropertyOptional({ nullable: true, example: "+54 11 5555-1234" })
  telefono!: string | null;

  @ApiPropertyOptional({ nullable: true })
  empresa!: string | null;
}
