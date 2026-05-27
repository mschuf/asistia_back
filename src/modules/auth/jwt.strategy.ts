import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { AppConfig } from "../../config/configuration";
import type { AuthenticatedUser, JwtPayload } from "../../common/types/authenticated-user";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, "jwt") {
  constructor(config: ConfigService<AppConfig, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get("jwt.secret", { infer: true }),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    return {
      id: payload.sub,
      login: payload.login,
      name: payload.name,
      email: payload.email,
      role: payload.role,
      groupIds: payload.groupIds ?? [],
      locationId: payload.locationId ?? null,
      entityId: payload.entityId ?? null,
      entityName: payload.entityName ?? null,
    };
  }
}
