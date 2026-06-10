/**
 * @file auth-cookie.helper.ts
 * @description Utilidades para leer, escribir y limpiar la cookie HttpOnly de sesión JWT.
 */
import type { Response } from "express";
import type { ConfigService } from "@nestjs/config";
import type { AppConfig } from "../../config/configuration";

/**
 * Convierte una cadena de expiración JWT (p. ej. `8h`, `30m`) a milisegundos.
 * @param value - Duración con unidad opcional (`s`, `m`, `h`, `d`).
 * @returns Duración en milisegundos; 8 horas por defecto si el formato no es válido.
 * @throws No lanza excepciones explícitas.
 */
function parseExpiresInMs(value: string): number {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d+)([smhd])?$/i);
  if (!match) return 8 * 3600 * 1000;

  const amount = Number(match[1]);
  const unit = (match[2] ?? "s").toLowerCase();

  switch (unit) {
    case "m":
      return amount * 60 * 1000;
    case "h":
      return amount * 3600 * 1000;
    case "d":
      return amount * 86400 * 1000;
    default:
      return amount * 1000;
  }
}

/**
 * Resuelve la duración máxima de la cookie de autenticación en milisegundos.
 * @param config - Servicio de configuración de la aplicación.
 * @returns `maxAgeMs` configurado o la expiración derivada del JWT.
 * @throws No lanza excepciones explícitas.
 */
export function resolveAuthCookieMaxAgeMs(config: ConfigService<AppConfig, true>): number {
  const configured = config.get("auth.cookie.maxAgeMs", { infer: true });
  if (configured > 0) return configured;
  return parseExpiresInMs(config.get("jwt.expiresIn", { infer: true }));
}

/**
 * Establece la cookie HttpOnly con el JWT de sesión.
 * @param res - Respuesta HTTP donde escribir la cookie.
 * @param token - JWT firmado de acceso.
 * @param config - Servicio de configuración con opciones de cookie.
 * @returns No devuelve valor.
 * @throws No lanza excepciones explícitas.
 */
export function setAuthCookie(
  res: Response,
  token: string,
  config: ConfigService<AppConfig, true>,
): void {
  const name = config.get("auth.cookie.name", { infer: true });
  const secure = config.get("auth.cookie.secure", { infer: true });
  const sameSite = config.get("auth.cookie.sameSite", { infer: true });

  res.cookie(name, token, {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
    maxAge: resolveAuthCookieMaxAgeMs(config),
  });
}

/**
 * Elimina la cookie de autenticación de la respuesta HTTP.
 * @param res - Respuesta HTTP donde limpiar la cookie.
 * @param config - Servicio de configuración con opciones de cookie.
 * @returns No devuelve valor.
 * @throws No lanza excepciones explícitas.
 */
export function clearAuthCookie(res: Response, config: ConfigService<AppConfig, true>): void {
  const name = config.get("auth.cookie.name", { infer: true });
  const secure = config.get("auth.cookie.secure", { infer: true });
  const sameSite = config.get("auth.cookie.sameSite", { infer: true });

  res.clearCookie(name, {
    httpOnly: true,
    secure,
    sameSite,
    path: "/",
  });
}

/**
 * Lee el nombre configurado de la cookie de sesión.
 * @param config - Servicio de configuración de la aplicación.
 * @returns Nombre de la cookie de autenticación.
 * @throws No lanza excepciones explícitas.
 */
export function readAuthCookieName(config: ConfigService<AppConfig, true>): string {
  return config.get("auth.cookie.name", { infer: true });
}
