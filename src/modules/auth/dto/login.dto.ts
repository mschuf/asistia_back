/**
 * @file login.dto.ts
 * @description DTO de entrada para autenticación con credenciales LDAP cifradas RSA-OAEP.
 */
import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

/**
 * Cuerpo de la petición POST /auth/login con usuario y contraseña cifrada.
 */
export class LoginDto {
  @ApiProperty({ description: "Username (sAMAccountName)", example: "nombre.apellido" })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({
    description: "RSA-OAEP encrypted password (base64)",
    example: "base64-ciphertext...",
  })
  @IsString()
  @IsNotEmpty()
  encryptedPassword!: string;
}
