import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";

export class ListUsersQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: "Free-text search in login, name or email" })
  @IsOptional()
  @IsString()
  search?: string;
}

export const DEFAULT_USERS_PAGE_LIMIT = 20;

