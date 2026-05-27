import { ApiProperty } from "@nestjs/swagger";

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
