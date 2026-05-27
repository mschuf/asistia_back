import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

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
