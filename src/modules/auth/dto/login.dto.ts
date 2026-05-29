import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class LoginDto {
  @ApiProperty({ description: "Username (sAMAccountName)", example: "nombre.apellido" })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({ description: "User password", example: "contraseña" })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
