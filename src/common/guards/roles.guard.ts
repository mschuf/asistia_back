/**
 * @file roles.guard.ts
 * @description Guard global que valida roles declarados con `@Roles()`.
 */
import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../decorators/roles.decorator";
import type { AuthenticatedUser, UserRole } from "../types/authenticated-user";
import { BusinessException } from "../exceptions/business.exception";
import { API_ERROR_CODE } from "../types/api-error-code";

/**
 * Verifica que el usuario autenticado cumpla los roles exigidos por el handler.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  /** Inyecta el reflector para leer metadatos de roles. */
  constructor(private readonly reflector: Reflector) {}

  /**
   * Permite el acceso si no hay roles requeridos o si el usuario los posee.
   * @param context - Contexto de ejecución HTTP.
   * @returns `true` si el acceso está autorizado.
   * @throws {BusinessException} Si falta autenticación o el rol no coincide.
   */
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
