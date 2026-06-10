/**
 * @file api-response.dto.ts
 * @description DTOs de Swagger para el sobre estándar de respuestas exitosas y de error.
 */
import { ApiProperty } from "@nestjs/swagger";

/**
 * Esquema Swagger de respuesta exitosa envuelta por el interceptor global.
 */
export class ApiSuccessResponseDto<T = unknown> {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ example: "Operation successful" })
  message!: string;

  @ApiProperty({ required: false })
  data?: T;
}

/**
 * Esquema Swagger de respuesta de error de la API.
 */
export class ApiErrorResponseDto {
  @ApiProperty({ example: false })
  success!: false;

  @ApiProperty({ example: "Categor├¡a inv├ílida" })
  message!: string;

  @ApiProperty({ example: "INVALID_CATEGORY" })
  code!: string;

  @ApiProperty({ required: false })
  details?: unknown;
}
