import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsPositive } from "class-validator";

export class AssignTechnicianDto {
  @ApiProperty({ example: 47 })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  technicianId!: number;
}
