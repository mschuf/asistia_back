/**
 * @file user-list.response.dto.ts
 * @description DTO de respuesta paginada para listados de usuarios.
 */
import { ApiProperty } from "@nestjs/swagger";
import { UserResponseDto } from "./user.response.dto";

/** Contenedor paginado de usuarios para respuestas HTTP. */
export class UserListResponseDto {
  @ApiProperty({ type: () => [UserResponseDto] })
  items!: UserResponseDto[];

  @ApiProperty({ example: 248 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;
}
