import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

export class SsoLoginDto {
  @ApiPropertyOptional({
    description: "Optional override of the SSO username. Mostly for testing scenarios.",
  })
  @IsOptional()
  @IsString()
  username?: string;
}
