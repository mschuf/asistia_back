/**
 * @file public.decorator.ts
 * @description Decorador que marca endpoints accesibles sin autenticación JWT.
 */
import { SetMetadata } from "@nestjs/common";

/** Clave de metadatos para rutas públicas. */
export const IS_PUBLIC_KEY = "isPublic";

/**
 * Marca un handler o controlador como público (sin JWT).
 * @returns Decorador de metadatos NestJS.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
