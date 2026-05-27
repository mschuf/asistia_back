import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class LoginDto {
  @ApiProperty({ description: "Username (sAMAccountName)", example: "jdoe" })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({ description: "User password" })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
