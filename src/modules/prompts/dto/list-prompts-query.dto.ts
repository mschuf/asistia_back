import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsPositive, IsString } from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";

export class ListPromptsQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: "Free-text search in company name or prompt content" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: "Filter by company id" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  companyId?: number;
}

export const DEFAULT_PROMPTS_PAGE_LIMIT = 20;
