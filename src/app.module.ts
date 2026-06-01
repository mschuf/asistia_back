import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, Reflector } from "@nestjs/core";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { LoggerModule } from "nestjs-pino";
import type { IncomingMessage, ServerResponse } from "node:http";
import { buildConfig, type AppConfig } from "./config/configuration";
import { validateEnv } from "./config/env.validation";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { ResponseInterceptor } from "./common/interceptors/response.interceptor";
import { TimeoutInterceptor } from "./common/interceptors/timeout.interceptor";
import { CryptoModule } from "./common/crypto/crypto.module";
import { JwtAuthGuard } from "./common/guards/auth.guard";
import { RolesGuard } from "./common/guards/roles.guard";
import { CacheModule } from "./modules/cache/cache.module";
import { GlpiModule } from "./modules/glpi/glpi.module";
import { MailModule } from "./modules/mail/mail.module";
import { AuthModule } from "./modules/auth/auth.module";
import { LdapAuthModule } from "./modules/ldap-auth/ldap-auth.module";
import { CatalogModule } from "./modules/catalog/catalog.module";
import { UsersModule } from "./modules/users/users.module";
import { TicketsModule } from "./modules/tickets/tickets.module";
import { AttachmentsModule } from "./modules/attachments/attachments.module";
import { HealthModule } from "./modules/health/health.module";
import { ProblemsModule } from "./modules/problems/problems.module";
import { ChangesModule } from "./modules/changes/changes.module";
import { AiModule } from "./modules/ai/ai.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [".env"],
      load: [buildConfig],
      validate: validateEnv,
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const level = config.get("logging.level", { infer: true });
        const isProduction = config.get("server.nodeEnv", { infer: true }) === "production";
        return {
          pinoHttp: {
            level,
            autoLogging: !isProduction
              ? {
                  ignore: (req) => req.url === "/api/v1/health",
                }
              : false,
            redact: {
              paths: [
                "req.headers.authorization",
                "req.headers.cookie",
                "req.headers['session-token']",
                "req.headers['app-token']",
                "req.body.password",
                "req.body.encryptedPassword",
                "req.body.accessToken",
                "res.headers['set-cookie']",
              ],
              censor: "[REDACTED]",
            },
            customLogLevel: (
              _req: IncomingMessage,
              res: ServerResponse<IncomingMessage>,
              err: Error | undefined,
            ) => {
              if (err || res.statusCode >= 500) return "error";
              if (res.statusCode >= 400) return "warn";
              return "info";
            },
            transport: isProduction
              ? undefined
              : {
                  target: "pino-pretty",
                  options: { singleLine: true, translateTime: "SYS:HH:MM:ss" },
                },
          },
        };
      },
    }),
    EventEmitterModule.forRoot({ wildcard: false, maxListeners: 20 }),
    CryptoModule,
    CacheModule,
    GlpiModule,
    MailModule,
    AuthModule,
    LdapAuthModule,
    HealthModule,
    CatalogModule,
    UsersModule,
    TicketsModule,
    AttachmentsModule,
    ProblemsModule,
    ChangesModule,
    AiModule,
  ],
  providers: [
    Reflector,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TimeoutInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
