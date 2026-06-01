import { ApiProperty } from "@nestjs/swagger";

export class PublicKeyResponseDto {
  @ApiProperty({ description: "RSA public key in PEM format" })
  publicKey!: string;
}
