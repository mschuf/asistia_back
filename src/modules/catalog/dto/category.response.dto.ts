import { ApiProperty } from "@nestjs/swagger";

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
