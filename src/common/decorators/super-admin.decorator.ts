/**
 * @file super-admin.decorator.ts
 * @description Decorador que marca un endpoint como accesible solo por superadministradores.
 */
import { SetMetadata } from "@nestjs/common";

/** Clave de metadatos para exigir superadmin. */
export const SUPER_ADMIN_KEY = "superAdmin";

/**
 * Marca un handler o controlador como restringido a superadministradores.
 * @returns Decorador de metadatos NestJS.
 */
export const SuperAdmin = () => SetMetadata(SUPER_ADMIN_KEY, true);
