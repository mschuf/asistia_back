import { ApiProperty } from "@nestjs/swagger";

export class ApiSuccessResponseDto<T = unknown> {
  @ApiProperty({ example: true })
  success!: true;

  @ApiProperty({ example: "Operation successful" })
  message!: string;

  @ApiProperty({ required: false })
  data?: T;
}

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
