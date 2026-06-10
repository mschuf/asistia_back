/**
 * @file list-users-query.dto.ts
 * @description DTO de consulta para listar usuarios con paginación y búsqueda libre.
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";
import { PaginationDto } from "../../../common/dto/pagination.dto";

/** Parámetros de query para el listado paginado de usuarios. */
export class ListUsersQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: "Free-text search in login, name or email" })
  @IsOptional()
  @IsString()
  search?: string;
}

/** Límite por defecto de registros por página en listados de usuarios. */
export const DEFAULT_USERS_PAGE_LIMIT = 20;
