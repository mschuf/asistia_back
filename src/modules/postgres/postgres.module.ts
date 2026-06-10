/**
 * @file postgres.module.ts
 * @description Módulo global que registra el pool PostgreSQL y expone {@link PostgresService}.
 */
import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Pool } from "pg";
import type { AppConfig } from "../../config/configuration";
import { POSTGRES_POOL } from "./postgres.constants";
import { PostgresService } from "./postgres.service";

/**
 * Provee y exporta el pool PostgreSQL para datos propios de asistIA.
 */
@Global()
@Module({
  providers: [
    {
      provide: POSTGRES_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>): Pool => {
        const host = config.get("postgres.host", { infer: true });
        const port = config.get("postgres.port", { infer: true });
        const database = config.get("postgres.database", { infer: true });
        const user = config.get("postgres.user", { infer: true });
        const password = config.get("postgres.password", { infer: true });
        const max = config.get("postgres.connectionLimit", { infer: true });
        const connectionTimeoutMillis = config.get("postgres.connectTimeoutMs", {
          infer: true,
        });
        const sslEnabled = config.get("postgres.ssl", { infer: true });

        return new Pool({
          host,
          port,
          database,
          user,
          password,
          max,
          connectionTimeoutMillis,
          ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
        });
      },
    },
    PostgresService,
  ],
  exports: [POSTGRES_POOL, PostgresService],
})
export class PostgresModule {}
