import { ApiProperty } from "@nestjs/swagger";

export class PromptDeleteResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: true })
  deleted!: true;
}
