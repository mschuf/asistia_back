import { ApiProperty } from "@nestjs/swagger";

export class AuthenticatedUserResponseDto {
  @ApiProperty({ example: 188 })
  id!: number;

  @ApiProperty({ example: "jdoe" })
  login!: string;

  @ApiProperty({ example: "Juan P├®rez" })
  name!: string;

  @ApiProperty({ example: "jperez@empresa.com", nullable: true })
  email!: string | null;

  @ApiProperty({ example: "technician", enum: ["final_user", "technician"] })
  role!: "final_user" | "technician";

  @ApiProperty({ example: 12, nullable: true })
  locationId!: number | null;

  @ApiProperty({ example: 1, nullable: true })
  entityId!: number | null;

  @ApiProperty({ example: "Holding > Empresa Principal", nullable: true })
  entityName!: string | null;
}

export class LoginResponseDto {
  @ApiProperty({ description: "JWT to send in the Authorization header" })
  accessToken!: string;

  @ApiProperty({ example: "8h" })
  expiresIn!: string;

  @ApiProperty({ type: () => AuthenticatedUserResponseDto })
  user!: AuthenticatedUserResponseDto;
}
