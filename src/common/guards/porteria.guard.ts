/**
 * @file porteria.guard.ts
 * @description Guard que restringe endpoints del módulo Portería a usuarios del grupo GLPI portería.
 */
import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import type { AuthenticatedUser } from "../types/authenticated-user";
import { BusinessException } from "../exceptions/business.exception";
import { API_ERROR_CODE } from "../types/api-error-code";
import { UsersGroupsSqlRepository } from "../../modules/glpi/repositories/users-groups.sql-repository";

/**
 * Verifica pertenencia al grupo GLPI de portería antes de permitir el acceso.
 */
@Injectable()
export class PorteriaGuard implements CanActivate {
  /** Inyecta repositorio SQL de grupos GLPI. */
  constructor(private readonly usersGroupsSqlRepo: UsersGroupsSqlRepository) {}

  /**
   * Permite el acceso solo si el usuario autenticado pertenece al grupo portería.
   * @param context - Contexto de ejecución HTTP.
   * @returns `true` si el acceso está autorizado.
   * @throws {BusinessException} Si falta autenticación o el usuario no pertenece al grupo.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new BusinessException({
        message: "Authentication required",
        code: API_ERROR_CODE.AUTH_REQUIRED,
        status: HttpStatus.UNAUTHORIZED,
      });
    }

    const isPorteriaUser = await this.usersGroupsSqlRepo.isPorteriaUser(user.id);
    if (!isPorteriaUser) {
      throw new BusinessException({
        message: "You do not have permission to access this resource",
        code: API_ERROR_CODE.FORBIDDEN,
        status: HttpStatus.FORBIDDEN,
      });
    }

    return true;
  }
}
