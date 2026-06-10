/**
 * @file auth.guard.ts
 * @description Guard JWT global que respeta rutas públicas y normaliza errores de autenticación.
 */
import { ExecutionContext, HttpStatus, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard as PassportAuthGuard } from "@nestjs/passport";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { BusinessException } from "../exceptions/business.exception";
import { API_ERROR_CODE } from "../types/api-error-code";

/**
 * Guard de autenticación JWT con soporte para endpoints `@Public()`.
 */
@Injectable()
export class JwtAuthGuard extends PassportAuthGuard("jwt") {
  /** Inyecta el reflector para detectar rutas públicas. */
  constructor(private readonly reflector: Reflector) {
    super();
  }

  /**
   * Omite la autenticación en handlers marcados como públicos.
   * @param context - Contexto de ejecución HTTP.
   * @returns `true` si es público; delegación a Passport en caso contrario.
   */
  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

  /**
   * Convierte fallos de Passport/JWT en excepciones de negocio consistentes.
   * @param err - Error original de Passport.
   * @param user - Usuario autenticado o `false` si falló.
   * @param info - Metadatos del error JWT (p. ej. expiración).
   * @returns Usuario autenticado tipado.
   * @throws {UnauthorizedException} Si el token expiró.
   * @throws {BusinessException} Si falta autenticación válida.
   */
  override handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser | false,
    info?: { name?: string; message?: string },
  ): TUser {
    if (info?.name === "TokenExpiredError") {
      throw new UnauthorizedException({
        code: "TOKEN_EXPIRED",
        message: "El token expiró. Iniciá sesión nuevamente.",
      });
    }

    if (err || !user) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new BusinessException({
        message: "Authentication required",
        code: API_ERROR_CODE.AUTH_REQUIRED,
        status: HttpStatus.UNAUTHORIZED,
      });
    }
    return user as TUser;
  }
}
