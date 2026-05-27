import { ApiProperty } from "@nestjs/swagger";

export class UserResponseDto {
  @ApiProperty({ example: 188 })
  id!: number;

  @ApiProperty({ example: "jdoe" })
  login!: string;

  @ApiProperty({ example: "Juan P├®rez" })
  fullName!: string;

  @ApiProperty({ nullable: true })
  firstName!: string | null;

  @ApiProperty({ nullable: true })
  lastName!: string | null;

  @ApiProperty({ nullable: true, example: "jperez@empresa.com" })
  email!: string | null;

  @ApiProperty({ nullable: true })
  phone!: string | null;

  @ApiProperty({ nullable: true })
  mobile!: string | null;

  @ApiProperty({ nullable: true, example: 12 })
  locationId!: number | null;

  @ApiProperty({ nullable: true, example: 4 })
  primaryGroupId!: number | null;

  @ApiProperty({ example: true })
  isActive!: boolean;
}
