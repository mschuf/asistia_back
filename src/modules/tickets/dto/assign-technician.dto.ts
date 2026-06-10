/**
 * @file assign-technician.dto.ts
 * @description DTO para asignar un técnico a un ticket existente.
 */
import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsPositive } from "class-validator";

/**
 * Payload de POST /tickets/:id/assign.
 */
export class AssignTechnicianDto {
  @ApiProperty({ example: 47 })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  technicianId!: number;
}
