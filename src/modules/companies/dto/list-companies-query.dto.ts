import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsOptional, IsString } from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";

export class ListCompaniesQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: "Free-text search in name or mailbox" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: "Return only active companies" })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null || value === "") return undefined;
    if (value === true || value === "true" || value === "1") return true;
    if (value === false || value === "false" || value === "0") return false;
    return value;
  })
  @IsBoolean()
  activeOnly?: boolean;
}

export const DEFAULT_COMPANIES_PAGE_LIMIT = 20;
