import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../decorators/roles.decorator";
import type { AuthenticatedUser, UserRole } from "../types/authenticated-user";
import { BusinessException } from "../exceptions/business.exception";
import { API_ERROR_CODE } from "../types/api-error-code";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
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

    if (!requiredRoles.includes(user.role)) {
      throw new BusinessException({
        message: "You do not have permission to access this resource",
        code: API_ERROR_CODE.FORBIDDEN,
        status: HttpStatus.FORBIDDEN,
      });
    }

    return true;
  }
}
