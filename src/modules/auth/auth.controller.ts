/**
 * @file auth.controller.ts
 * @description Endpoints HTTP de autenticación: clave pública RSA, login LDAP, perfil y logout.
 */
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

/**
 * Controlador HTTP de autenticación con sesión JWT en cookie HttpOnly.
 */
@ApiTags("auth")
@Controller("auth")
export class AuthController {
  /** Inyecta servicio de autenticación, cifrado y configuración. */
  constructor(
    private readonly authService: AuthService,
    private readonly cryptoService: CryptoService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Expone la clave pública RSA para cifrar credenciales en el cliente.
   * @returns Clave pública en formato PEM.
   * @throws No lanza excepciones explícitas.
   */
  @Get("public-key")
  @Public()
  @ApiOperation({ summary: "Get RSA public key for encrypting login credentials" })
  @ApiResponse({ status: 200, type: PublicKeyResponseDto })
  @ResponseMessage("Public key retrieved")
  getPublicKey(): PublicKeyResponseDto {
    return { publicKey: this.cryptoService.getPublicKeyPem() };
  }

  /**
   * Autentica con credenciales LDAP cifradas y establece la cookie de sesión.
   * @param dto - Usuario y contraseña cifrada con RSA-OAEP.
   * @param res - Respuesta HTTP para escribir la cookie de sesión.
   * @returns Token de expiración y perfil del usuario autenticado.
   * @throws {BusinessException} Si las credenciales son inválidas o el usuario no existe en GLPI.
   */
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

  /**
   * Devuelve el perfil del usuario autenticado y la expiración de la sesión.
   * @param user - Usuario autenticado extraído del JWT.
   * @param req - Petición HTTP con la cookie de sesión.
   * @returns Perfil enriquecido desde GLPI y timestamp de expiración.
   * @throws {BusinessException} Si el usuario no existe en GLPI.
   */
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

  /**
   * Cierra la sesión del usuario eliminando la cookie HttpOnly.
   * @param user - Usuario autenticado cuya sesión se revoca.
   * @param res - Respuesta HTTP para limpiar la cookie.
   * @returns Indicador de revocación exitosa.
   * @throws No lanza excepciones explícitas.
   */
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

  /**
   * Mapea un usuario de sesión al DTO de respuesta HTTP.
   * @param user - Usuario de sesión con perfil GLPI.
   * @returns DTO serializable del usuario autenticado.
   * @throws No lanza excepciones explícitas.
   */
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
      isSuperAdmin: user.isSuperAdmin,
      isPorteriaUser: user.isPorteriaUser,
    };
  }

  /**
   * Construye la respuesta de login a partir del resultado del servicio.
   * @param result - Token de expiración y usuario de sesión.
   * @returns DTO de respuesta de autenticación exitosa.
   * @throws No lanza excepciones explícitas.
   */
  private static toLoginResponse(result: {
    expiresIn: string;
    user: SessionUser;
  }): LoginResponseDto {
    return {
      expiresIn: result.expiresIn,
      user: AuthController.toUserDto(result.user),
    };
  }

  /**
   * Extrae el timestamp de expiración del JWT almacenado en la cookie de sesión.
   * @param req - Petición HTTP con cookies.
   * @param config - Servicio de configuración con el nombre de la cookie.
   * @returns Timestamp Unix en milisegundos; usa la hora actual si no puede decodificar el token.
   * @throws No lanza excepciones explícitas; captura errores de decodificación internamente.
   */
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
