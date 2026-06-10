/**
 * @file mysql.module.ts
 * @description Módulo global que registra el pool MySQL y expone {@link MysqlService}.
 */
import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createPool, type Pool } from "mysql2/promise";
import type { AppConfig } from "../../config/configuration";
import { MYSQL_POOL } from "./mysql.constants";
import { MysqlService } from "./mysql.service";

/**
 * Provee y exporta el pool MySQL para acceso SQL directo a GLPI.
 */
@Global()
@Module({
  providers: [
    {
      provide: MYSQL_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>): Pool => {
        const host = config.get("mysql.host", { infer: true });
        const port = config.get("mysql.port", { infer: true });
        const database = config.get("mysql.database", { infer: true });
        const user = config.get("mysql.user", { infer: true });
        const password = config.get("mysql.password", { infer: true });
        const connectionLimit = config.get("mysql.connectionLimit", { infer: true });
        const connectTimeout = config.get("mysql.connectTimeoutMs", { infer: true });

        return createPool({
          host,
          port,
          database,
          user,
          password,
          connectionLimit,
          connectTimeout,
          namedPlaceholders: true,
          timezone: "Z",
        });
      },
    },
    MysqlService,
  ],
  exports: [MYSQL_POOL, MysqlService],
})
export class MysqlModule {}
