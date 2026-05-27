import { ExecutionContext, HttpStatus, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard as PassportAuthGuard } from "@nestjs/passport";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { BusinessException } from "../exceptions/business.exception";
import { API_ERROR_CODE } from "../types/api-error-code";

@Injectable()
export class JwtAuthGuard extends PassportAuthGuard("jwt") {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }

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
