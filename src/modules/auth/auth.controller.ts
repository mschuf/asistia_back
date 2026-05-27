import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Public } from "../../common/decorators/public.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ResponseMessage } from "../../common/interceptors/response-message.decorator";
import { JwtAuthGuard } from "../../common/guards/auth.guard";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import {
  AuthenticatedUserResponseDto,
  LoginResponseDto,
} from "./dto/login-response.dto";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Sign in with LDAP credentials and obtain a JWT",
    description:
      "Valida el usuario contra LDAP/AD, resuelve el perfil en GLPI y devuelve un JWT. " +
      "Las operaciones GLPI se ejecutan con la cuenta de servicio configurada.",
  })
  @ApiResponse({ status: 200, type: LoginResponseDto })
  @ResponseMessage("Authentication successful")
  async login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    const result = await this.authService.loginWithCredentials(dto.username, dto.password);
    return AuthController.toResponse(result);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get the currently authenticated user profile" })
  @ApiResponse({ status: 200, type: AuthenticatedUserResponseDto })
  @ResponseMessage("Profile retrieved")
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUserResponseDto {
    return AuthController.toUserDto(user);
  }

  @Post("logout")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Logout (stateless)",
    description: "El cliente debe descartar el JWT localmente.",
  })
  @ResponseMessage("Logged out")
  async logout(@CurrentUser() user: AuthenticatedUser): Promise<{ revoked: boolean }> {
    await this.authService.logout(user);
    return { revoked: true };
  }

  private static toUserDto(user: AuthenticatedUser): AuthenticatedUserResponseDto {
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

  private static toResponse(result: {
    accessToken: string;
    expiresIn: string;
    user: AuthenticatedUser;
  }): LoginResponseDto {
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: AuthController.toUserDto(result.user),
    };
  }
}
