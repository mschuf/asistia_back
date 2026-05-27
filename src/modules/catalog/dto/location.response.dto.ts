import { ApiProperty } from "@nestjs/swagger";

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
