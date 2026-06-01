import type { Response } from "express";
import type { ConfigService } from "@nestjs/config";
import type { AppConfig } from "../../config/configuration";

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

export function resolveAuthCookieMaxAgeMs(config: ConfigService<AppConfig, true>): number {
  const configured = config.get("auth.cookie.maxAgeMs", { infer: true });
  if (configured > 0) return configured;
  return parseExpiresInMs(config.get("jwt.expiresIn", { infer: true }));
}

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

export function readAuthCookieName(config: ConfigService<AppConfig, true>): string {
  return config.get("auth.cookie.name", { infer: true });
}
