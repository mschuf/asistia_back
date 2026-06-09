import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsNotEmpty, IsPositive, IsString } from "class-validator";

export class CreatePromptDto {
  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  companyId!: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  systemInstruction!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  promptTemplate!: string;
}
