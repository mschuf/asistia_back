import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiBearerAuth, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ResponseMessage } from "../../common/interceptors/response-message.decorator";
import { JwtAuthGuard } from "../../common/guards/auth.guard";
import type { AuthenticatedUser, SessionUser } from "../../common/types/authenticated-user";
import { CryptoService } from "../../common/crypto/crypto.service";
import type { AppConfig } from "../../config/configuration";
import { AuthService } from "./auth.service";
import { clearAuthCookie, readAuthCookieName, setAuthCookie } from "./auth-cookie.helper";
import { LoginDto } from "./dto/login.dto";
import {
  AuthenticatedUserResponseDto,
  LoginResponseDto,
  SessionResponseDto,
} from "./dto/login-response.dto";
import { PublicKeyResponseDto } from "./dto/public-key-response.dto";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly cryptoService: CryptoService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Get("public-key")
  @Public()
  @ApiOperation({ summary: "Get RSA public key for encrypting login credentials" })
  @ApiResponse({ status: 200, type: PublicKeyResponseDto })
  @ResponseMessage("Public key retrieved")
  getPublicKey(): PublicKeyResponseDto {
    return { publicKey: this.cryptoService.getPublicKeyPem() };
  }

  @Post("login")
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Sign in with LDAP credentials and obtain a session cookie",
    description:
      "Valida el usuario contra LDAP/AD con contraseña cifrada RSA-OAEP, resuelve el perfil en GLPI " +
      "y establece un JWT en cookie HttpOnly. Las operaciones GLPI se ejecutan con la cuenta de servicio configurada.",
  })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  @ResponseMessage("Authentication successful")
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    const result = await this.authService.loginWithEncryptedCredentials(
      dto.username,
      dto.encryptedPassword,
    );
    setAuthCookie(res, result.accessToken, this.config);
    return AuthController.toLoginResponse(result);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiCookieAuth("session")
  @ApiOperation({ summary: "Get the currently authenticated user profile" })
  @ApiResponse({ status: 200, type: SessionResponseDto })
  @ResponseMessage("Profile retrieved")
  async me(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<SessionResponseDto> {
    const profile = await this.authService.resolveProfile(user);
    return {
      user: AuthController.toUserDto(profile),
      expiresAt: AuthController.resolveExpiresAt(req, this.config),
    };
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiCookieAuth("session")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Logout",
    description: "Elimina la cookie de sesión HttpOnly.",
  })
  @ResponseMessage("Logged out")
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ revoked: boolean }> {
    await this.authService.logout(user);
    clearAuthCookie(res, this.config);
    return { revoked: true };
  }

  private static toUserDto(user: SessionUser): AuthenticatedUserResponseDto {
    return {
      id: user.id,
      login: user.login,
      name: user.name,
      email: user.email,
      role: user.role,
      locationId: user.locationId,
      entityId: user.entityId,
      entityName: user.entityName,
    };
  }

  private static toLoginResponse(result: {
    expiresIn: string;
    user: SessionUser;
  }): LoginResponseDto {
    return {
      expiresIn: result.expiresIn,
      user: AuthController.toUserDto(result.user),
    };
  }

  private static resolveExpiresAt(req: Request, config: ConfigService<AppConfig, true>): number {
    const cookieName = readAuthCookieName(config);
    const token = req.cookies?.[cookieName];
    if (typeof token !== "string" || !token) {
      return Date.now();
    }

    try {
      const payloadPart = token.split(".")[1];
      if (!payloadPart) return Date.now();
      const payload = JSON.parse(
        Buffer.from(payloadPart, "base64url").toString("utf8"),
      ) as { exp?: number };
      if (typeof payload.exp === "number") {
        return payload.exp * 1000;
      }
    } catch {
      return Date.now();
    }

    return Date.now();
  }
}
