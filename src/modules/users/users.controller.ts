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
import { UsersService } from "./users.service";
import { UserResponseDto } from "./dto/user.response.dto";
import { MeResponseDto } from "./dto/me.response.dto";
import { ListUsersQueryDto } from "./dto/list-users-query.dto";
import { UserListResponseDto } from "./dto/user-list.response.dto";

@ApiTags("users")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  @ApiOperation({ summary: "Get the currently authenticated user profile" })
  @ApiResponse({ status: 200, type: MeResponseDto })
  @ResponseMessage("Profile retrieved")
  me(@CurrentUser() user: AuthenticatedUser): MeResponseDto {
    return {
      id: user.id,
      login: user.login,
      name: user.name,
      email: user.email,
      role: user.role,
      groupIds: user.groupIds,
      locationId: user.locationId,
      entityId: user.entityId,
      entityName: user.entityName,
    };
  }

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

  @Get()
  @Roles("technician")
  @ApiOperation({ summary: "List users with pagination and optional search. Restricted to technicians." })
  @ApiResponse({ status: 200, type: UserListResponseDto })
  @ResponseMessage("Users retrieved")
  async list(@Query() query: ListUsersQueryDto): Promise<UserListResponseDto> {
    return this.usersService.list(query);
  }

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
