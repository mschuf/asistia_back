/**
 * @file users.controller.ts
 * @description Endpoints HTTP para perfil autenticado, listado de usuarios y técnicos.
 */
import { Controller, Get, HttpStatus, Param, ParseIntPipe, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ResponseMessage } from "../../common/interceptors/response-message.decorator";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { AuthService } from "../auth/auth.service";
import { UsersService } from "./users.service";
import { UserResponseDto } from "./dto/user.response.dto";
import { MeResponseDto } from "./dto/me.response.dto";
import { ListUsersQueryDto } from "./dto/list-users-query.dto";
import { UserListResponseDto } from "./dto/user-list.response.dto";

/** Controlador REST del módulo de usuarios protegido con JWT y roles. */
@ApiTags("users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("users")
export class UsersController {
  /**
   * Inyecta servicios de usuarios y autenticación.
   * @param usersService - Servicio de consulta de usuarios.
   * @param authService - Servicio de resolución de perfil autenticado.
   */
  constructor(
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Devuelve el perfil del usuario autenticado.
   * @param user - Usuario extraído del token JWT.
   * @returns Perfil enriquecido con datos GLPI y rol.
   */
  @Get("me")
  @ApiOperation({ summary: "Get the currently authenticated user profile" })
  @ApiResponse({ status: 200, type: MeResponseDto })
  @ResponseMessage("Profile retrieved")
  async me(@CurrentUser() user: AuthenticatedUser): Promise<MeResponseDto> {
    const profile = await this.authService.resolveProfile(user);
    return {
      id: user.id,
      login: profile.login,
      name: profile.name,
      email: profile.email,
      role: user.role,
      groupIds: profile.groupIds,
      locationId: user.locationId,
      entityId: profile.entityId,
      entityName: profile.entityName,
    };
  }

  /**
   * Lista técnicos activos elegibles con paginación opcional.
   * @param query - Parámetros de paginación y búsqueda.
   * @returns Lista paginada de técnicos.
   */
  @Get("technicians")
  @ApiOperation({
    summary:
      "List active technicians (TI group members, primary TI group, or operational IT profiles)",
  })
  @ApiResponse({ status: 200, type: UserListResponseDto })
  @ResponseMessage("Technicians retrieved")
  async technicians(@Query() query: ListUsersQueryDto): Promise<UserListResponseDto> {
    return this.usersService.listTechnicians(query);
  }

  /**
   * Lista usuarios con paginación; restringido a rol técnico.
   * @param query - Parámetros de paginación y búsqueda.
   * @returns Lista paginada de usuarios activos.
   */
  @Get()
  @Roles("technician")
  @ApiOperation({ summary: "List users with pagination and optional search. Restricted to technicians." })
  @ApiResponse({ status: 200, type: UserListResponseDto })
  @ResponseMessage("Users retrieved")
  async list(@Query() query: ListUsersQueryDto): Promise<UserListResponseDto> {
    return this.usersService.list(query);
  }

  /**
   * Obtiene un usuario por ID; usuarios finales solo pueden ver su propio perfil.
   * @param current - Usuario autenticado que realiza la consulta.
   * @param id - ID del usuario solicitado.
   * @returns DTO del usuario encontrado.
   * @throws {BusinessException} Si no tiene permiso o el usuario no existe.
   */
  @Get(":id")
  @ApiOperation({ summary: "Get a user by id" })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ResponseMessage("User retrieved")
  async byId(
    @CurrentUser() current: AuthenticatedUser,
    @Param("id", ParseIntPipe) id: number,
  ): Promise<UserResponseDto> {
    if (current.role !== "technician" && current.id !== id) {
      throw new BusinessException({
        message: "You can only view your own profile",
        code: API_ERROR_CODE.FORBIDDEN,
        status: HttpStatus.FORBIDDEN,
      });
    }
    const user = await this.usersService.findById(id);
    if (!user) {
      throw new BusinessException({
        message: `User ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }
    return user;
  }
}
