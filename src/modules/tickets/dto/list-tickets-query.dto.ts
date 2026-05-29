import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";
import { TICKET_STATUS, type TicketStatus } from "../domain/ticket-status";
import { TICKET_TYPE, type TicketType } from "../domain/ticket-type";

export class ListTicketsQueryDto extends PaginationDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 15, default: 15, description: "Tickets per page (historial)" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(15)
  declare limit?: number;

  @ApiPropertyOptional({ enum: Object.values(TICKET_STATUS) })
  @IsOptional()
  @IsEnum(Object.values(TICKET_STATUS))
  status?: TicketStatus;

  @ApiPropertyOptional({
    description: "Comma-separated ticket statuses (e.g. assigned,planned)",
    example: "assigned,planned",
  })
  @IsOptional()
  @IsString()
  statuses?: string;

  @ApiPropertyOptional({ enum: Object.values(TICKET_TYPE) })
  @IsOptional()
  @IsEnum(Object.values(TICKET_TYPE))
  type?: TicketType;

  @ApiPropertyOptional({ description: "Free-text search in subject/description" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: "When true, only tickets assigned to the current technician.",
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => ["true", "1", "yes", true].includes(value))
  @IsBoolean()
  assignedToMe?: boolean;

  @ApiPropertyOptional({ type: Number, example: 47 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  technicianId?: number;

  @ApiPropertyOptional({ type: Number, example: 12, description: "Filter by ticket location (sede)" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  locationId?: number;
}
