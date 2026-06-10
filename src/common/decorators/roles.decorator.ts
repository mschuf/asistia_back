/**
 * @file roles.decorator.ts
 * @description Decorador para restringir handlers a uno o más roles de usuario.
 */
import { SetMetadata } from "@nestjs/common";
import type { UserRole } from "../types/authenticated-user";

/** Clave de metadatos donde se almacenan los roles requeridos. */
export const ROLES_KEY = "roles";

/**
 * Exige que el usuario autenticado tenga al menos uno de los roles indicados.
 * @param roles - Roles permitidos para acceder al handler.
 * @returns Decorador de metadatos NestJS.
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
