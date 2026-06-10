/**
 * @file category.response.dto.ts
 * @description DTO de respuesta de una categoría ITIL GLPI.
 */
import { ApiProperty } from "@nestjs/swagger";

/** Representación serializable de una categoría ITIL para la API. */
export class CategoryResponseDto {
  @ApiProperty({ example: 65 })
  id!: number;

  @ApiProperty({ example: "Software: Office, Windows, SAP, Aplicaciones" })
  name!: string;

  @ApiProperty({ example: "Software > Office > Outlook" })
  fullPath!: string;

  @ApiProperty({ nullable: true, example: null })
  parentId!: number | null;

  @ApiProperty({ example: 0 })
  level!: number;
}
