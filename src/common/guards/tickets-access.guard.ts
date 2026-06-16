/**
 * @file tickets-access.guard.ts
 * @description Guard que impide acceso a tickets a usuarios solo del grupo GLPI portería.
 */
import { CanActivate, ExecutionContext, HttpStatus, Injectable } from "@nestjs/common";
import type { AuthenticatedUser } from "../types/authenticated-user";
import { BusinessException } from "../exceptions/business.exception";
import { API_ERROR_CODE } from "../types/api-error-code";
import { UsersGroupsSqlRepository } from "../../modules/glpi/repositories/users-groups.sql-repository";

/**
 * Verifica que el usuario no sea exclusivamente de portería antes de permitir acceso a tickets.
 */
@Injectable()
export class TicketsAccessGuard implements CanActivate {
  /** Inyecta repositorio SQL de grupos GLPI. */
  constructor(private readonly usersGroupsSqlRepo: UsersGroupsSqlRepository) {}

  /**
   * Permite el acceso salvo usuarios final_user pertenecientes solo al grupo portería.
   * @param context - Contexto de ejecución HTTP.
   * @returns `true` si el acceso está autorizado.
   * @throws {BusinessException} Si falta autenticación o el usuario no puede acceder a tickets.
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

    if (user.role !== "final_user") {
      return true;
    }

    const isPorteriaUser = await this.usersGroupsSqlRepo.isPorteriaUser(user.id);
    if (isPorteriaUser) {
      throw new BusinessException({
        message: "You do not have permission to access this resource",
        code: API_ERROR_CODE.FORBIDDEN,
        status: HttpStatus.FORBIDDEN,
      });
    }

    return true;
  }
}
