/**
 * @file jwt.strategy.ts
 * @description Estrategia Passport JWT que extrae el token desde cookie o cabecera Bearer.
 */
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { Request } from "express";
import type { AppConfig } from "../../config/configuration";
import { readAuthCookieName } from "./auth-cookie.helper";
import type { AuthenticatedUser, JwtPayload } from "../../common/types/authenticated-user";

/**
 * Estrategia JWT de Passport para validar sesiones en cookie HttpOnly o Bearer token.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  /**
   * Configura la extracción del JWT y la clave de verificación.
   * @param config - Servicio de configuración con secreto JWT y nombre de cookie.
   * @throws Error de Passport si la configuración de estrategia es inválida.
   */
  constructor(config: ConfigService<AppConfig, true>) {
    const cookieName = readAuthCookieName(config);

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        /**
         * Extrae el JWT desde la cookie de sesión HttpOnly.
         * @param req - Petición HTTP entrante.
         * @returns Token JWT o `null` si no existe la cookie.
         * @throws No lanza excepciones explícitas.
         */
        (req: Request) => {
          const cookies = req?.cookies as Record<string, string> | undefined;
          return cookies?.[cookieName] ?? null;
        },
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get("jwt.secret", { infer: true }),
    });
  }

  /**
   * Mapea el payload JWT al usuario autenticado usado por los guards.
   * @param payload - Claims decodificados del JWT.
   * @returns Usuario autenticado con id, rol y ubicación.
   * @throws No lanza excepciones explícitas.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    return {
      id: payload.sub,
      role: payload.role,
      locationId: payload.locationId ?? null,
    };
  }
}
