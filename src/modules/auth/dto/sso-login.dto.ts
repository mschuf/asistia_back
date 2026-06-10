/**
 * @file sso-login.dto.ts
 * @description DTO opcional para forzar usuario en flujos de login SSO (principalmente pruebas).
 */
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString } from "class-validator";

/**
 * Cuerpo opcional para sobrescribir el usuario detectado por cabecera SSO.
 */
export class SsoLoginDto {
  @ApiPropertyOptional({
    description: "Optional override of the SSO username. Mostly for testing scenarios.",
  })
  @IsOptional()
  @IsString()
  username?: string;
}
