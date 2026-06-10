/**
 * @file ldap-auth.controller.ts
 * @description Endpoints legacy de autenticación LDAP directa sin JWT ni integración GLPI.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Public } from "../../common/decorators/public.decorator";
import { LdapAuthService } from "./ldap-auth.service";
import { LdapLoginDto } from "./dto/ldap-login.dto";

/**
 * Controlador HTTP que replica el endpoint legacy /ldap-auth del sistema anterior.
 */
@ApiTags("ldap-auth")
@Controller("ldap-auth")
export class LdapAuthController {
  /** Inyecta el servicio de autenticación LDAP directa. */
  constructor(private readonly ldapAuthService: LdapAuthService) {}

  /**
   * Autentica contra AD/LDAP y devuelve atributos crudos del usuario.
   * @param loginDto - Usuario y contraseña en texto plano.
   * @returns Objeto con `success: true` y atributos del usuario en Active Directory.
   * @throws {HttpException} Con estado 401 si la autenticación falla.
   */
  @Post("login")
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Authenticate against LDAP and return raw AD user attributes",
    description:
      "Replica del endpoint legacy /ldap-auth/login. Valida usuario y contraseña contra AD/LDAP y devuelve los atributos crudos del usuario (no emite JWT ni consulta GLPI).",
  })
  @ApiResponse({ status: 200, description: "Authenticated user" })
  async login(@Body() loginDto: LdapLoginDto) {
    try {
      return await this.ldapAuthService.authenticate(loginDto.username, loginDto.password);
    } catch {
      throw new HttpException("Authentication failed", HttpStatus.UNAUTHORIZED);
    }
  }

  /**
   * Diagnóstico que expone los namingContexts del servidor LDAP configurado.
   * @returns Resultado con `success: true` y entrada rootDSE del directorio.
   * @throws Error reenviado si las credenciales admin no están configuradas o falla la conexión.
   */
  @Get("test-basedn")
  @Public()
  @ApiOperation({ summary: "Diagnóstico: muestra los namingContexts del servidor LDAP" })
  async testBaseDN() {
    return this.ldapAuthService.testBaseDN();
  }
}
