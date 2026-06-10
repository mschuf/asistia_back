/**
 * @file public-key-response.dto.ts
 * @description DTO de respuesta con la clave pública RSA para cifrado de credenciales en el cliente.
 */
import { ApiProperty } from "@nestjs/swagger";

/**
 * Clave pública RSA en formato PEM expuesta por GET /auth/public-key.
 */
export class PublicKeyResponseDto {
  @ApiProperty({ description: "RSA public key in PEM format" })
  publicKey!: string;
}
