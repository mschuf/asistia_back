import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { Request } from "express";
import type { AppConfig } from "../../config/configuration";
import { readAuthCookieName } from "./auth-cookie.helper";
import type { AuthenticatedUser, JwtPayload } from "../../common/types/authenticated-user";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(config: ConfigService<AppConfig, true>) {
    const cookieName = readAuthCookieName(config);

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
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

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    return {
      id: payload.sub,
      role: payload.role,
      locationId: payload.locationId ?? null,
    };
  }
}
