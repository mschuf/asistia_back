import { ApiProperty } from "@nestjs/swagger";

export class CompanyDeleteResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: true })
  deleted!: true;
}
