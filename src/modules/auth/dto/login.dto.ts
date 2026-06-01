import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

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
