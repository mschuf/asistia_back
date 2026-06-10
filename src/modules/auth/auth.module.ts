/**
 * @file auth.module.ts
 * @description Módulo NestJS de autenticación con JWT, Passport y proveedor LDAP.
 */
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import type { AppConfig } from "../../config/configuration";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtStrategy } from "./jwt.strategy";
import { LdapProvider } from "./strategies/ldap.provider";

/**
 * Registra controlador, servicios y estrategia JWT para autenticación LDAP/GLPI.
 */
@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      /**
       * Configura el módulo JWT con secreto y expiración desde variables de entorno.
       * @param config - Servicio de configuración de la aplicación.
       * @returns Opciones de registro del módulo JWT.
       * @throws No lanza excepciones explícitas.
       */
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get("jwt.secret", { infer: true }),
        signOptions: { expiresIn: config.get("jwt.expiresIn", { infer: true }) },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, LdapProvider],
  exports: [AuthService, JwtModule, PassportModule, LdapProvider],
})
export class AuthModule {}
