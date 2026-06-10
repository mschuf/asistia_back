/**
 * @file current-user.decorator.ts
 * @description Decorador de parámetro para inyectar el usuario autenticado del request.
 */
import { ExecutionContext, createParamDecorator } from "@nestjs/common";
import type { AuthenticatedUser } from "../types/authenticated-user";

/**
 * Extrae el usuario autenticado o una propiedad concreta del JWT/sesión.
 * @param data - Propiedad opcional de {@link AuthenticatedUser} a devolver.
 * @param ctx - Contexto de ejecución HTTP.
 * @returns Usuario completo, una propiedad o `undefined` si no hay sesión.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) return undefined;
    return data ? user[data] : user;
  },
);
