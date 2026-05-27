import { ApiProperty } from "@nestjs/swagger";
import { UserResponseDto } from "./user.response.dto";

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

