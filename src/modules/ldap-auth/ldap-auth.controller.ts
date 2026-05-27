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

@ApiTags("ldap-auth")
@Controller("ldap-auth")
export class LdapAuthController {
  constructor(private readonly ldapAuthService: LdapAuthService) {}

  @Post("login")
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Authenticate against LDAP and return raw AD user attributes",
    description:
      "Replica del endpoint legacy /ldap-auth/login. Valida usuario y contrase├▒a contra AD/LDAP y devuelve los atributos crudos del usuario (no emite JWT ni consulta GLPI).",
  })
  @ApiResponse({ status: 200, description: "Authenticated user" })
  async login(@Body() loginDto: LdapLoginDto) {
    try {
      return await this.ldapAuthService.authenticate(loginDto.username, loginDto.password);
    } catch {
      throw new HttpException("Authentication failed", HttpStatus.UNAUTHORIZED);
    }
  }

  @Get("test-basedn")
  @Public()
  @ApiOperation({ summary: "Diagn├│stico: muestra los namingContexts del servidor LDAP" })
  async testBaseDN() {
    return this.ldapAuthService.testBaseDN();
  }
}
