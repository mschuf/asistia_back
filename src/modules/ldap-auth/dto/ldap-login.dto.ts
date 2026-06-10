/**
 * @file ldap-login.dto.ts
 * @description DTO de entrada para autenticación LDAP legacy con usuario y contraseña en claro.
 */
import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

/**
 * Cuerpo de la petición POST /ldap-auth/login con credenciales en texto plano.
 */
export class LdapLoginDto {
  @ApiProperty({ description: "Username for LDAP authentication", example: "alejandro.cardozo" })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({ description: "Password for LDAP authentication" })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
