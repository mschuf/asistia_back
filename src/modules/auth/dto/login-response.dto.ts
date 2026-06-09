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

  @ApiProperty({
    description: "Indica si el usuario tiene perfil Super-Admin en alguna entidad GLPI",
    example: false,
  })
  isSuperAdmin!: boolean;
}

export class LoginResponseDto {
  @ApiProperty({ example: "8h" })
  expiresIn!: string;

  @ApiProperty({ type: () => AuthenticatedUserResponseDto })
  user!: AuthenticatedUserResponseDto;
}

export class SessionResponseDto {
  @ApiProperty({ type: () => AuthenticatedUserResponseDto })
  user!: AuthenticatedUserResponseDto;

  @ApiProperty({
    description: "Session expiry timestamp in milliseconds (Unix epoch)",
    example: 1710000000000,
  })
  expiresAt!: number;
}
