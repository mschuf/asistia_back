/**
 * @file super-admin.guard.ts
 * @description Guard que restringe endpoints marcados con `@SuperAdmin()` a usuarios superadmin en GLPI.
 */
import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { SUPER_ADMIN_KEY } from "../decorators/super-admin.decorator";
import type { AuthenticatedUser } from "../types/authenticated-user";
import { BusinessException } from "../exceptions/business.exception";
import { API_ERROR_CODE } from "../types/api-error-code";
import { UsersProfilesSqlRepository } from "../../modules/glpi/repositories/users-profiles.sql-repository";

/**
 * Verifica permisos de superadministrador cuando el handler lo exige.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  /** Inyecta reflector y repositorio de perfiles GLPI. */
  constructor(
    private readonly reflector: Reflector,
    private readonly usersProfilesSqlRepo: UsersProfilesSqlRepository,
  ) {}

  /**
   * Permite el acceso si no se requiere superadmin o si el usuario lo es en GLPI.
   * @param context - Contexto de ejecución HTTP.
   * @returns `true` si el acceso está autorizado.
   * @throws {BusinessException} Si falta autenticación o el usuario no es superadmin.
   */
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
