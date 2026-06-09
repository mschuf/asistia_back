import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SUPER_ADMIN_KEY } from "../decorators/super-admin.decorator";
import type { AuthenticatedUser } from "../types/authenticated-user";
import { BusinessException } from "../exceptions/business.exception";
import { API_ERROR_CODE } from "../types/api-error-code";
import { UsersProfilesSqlRepository } from "../../modules/glpi/repositories/users-profiles.sql-repository";

@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usersProfilesSqlRepo: UsersProfilesSqlRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiresSuperAdmin = this.reflector.getAllAndOverride<boolean | undefined>(
      SUPER_ADMIN_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiresSuperAdmin) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new BusinessException({
        message: "Authentication required",
        code: API_ERROR_CODE.AUTH_REQUIRED,
        status: HttpStatus.UNAUTHORIZED,
      });
    }

    const isSuperAdmin = await this.usersProfilesSqlRepo.isSuperAdminUser(user.id);
    if (!isSuperAdmin) {
      throw new BusinessException({
        message: "You do not have permission to access this resource",
        code: API_ERROR_CODE.FORBIDDEN,
        status: HttpStatus.FORBIDDEN,
      });
    }

    return true;
  }
}
