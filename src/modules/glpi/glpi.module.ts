/**
 * @file glpi.module.ts
 * @description Módulo NestJS global que registra cliente, sesiones, bootstrap y repositorios GLPI.
 */
import { HttpModule } from "@nestjs/axios";
import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppConfig } from "../../config/configuration";
import { GlpiClient } from "./glpi.client";
import { GlpiSessionManager } from "./glpi-session.manager";
import { GlpiBootstrapService } from "./glpi-bootstrap.service";
import { UsersGlpiRepository } from "./repositories/users.glpi-repository";
import { CatalogGlpiRepository } from "./repositories/catalog.glpi-repository";
import { TicketsGlpiRepository } from "./repositories/tickets.glpi-repository";
import { TicketsHistorySqlRepository } from "./repositories/tickets-history.sql-repository";
import { TicketsMetricsSqlRepository } from "./repositories/tickets-metrics.sql-repository";
import { TicketsStatusSqlRepository } from "./repositories/tickets-status.sql-repository";
import { TicketsCreateSqlRepository } from "./repositories/tickets-create.sql-repository";
import { UsersTechniciansSqlRepository } from "./repositories/users-technicians.sql-repository";
import { UsersGroupsSqlRepository } from "./repositories/users-groups.sql-repository";
import { LocationsSqlRepository } from "./repositories/locations.sql-repository";
import { UsersProfilesSqlRepository } from "./repositories/users-profiles.sql-repository";

/**
 * Módulo global de integración con GLPI (HTTP, sesiones y persistencia).
 */
@Global()
@Module({
  imports: [
    HttpModule.registerAsync({
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        timeout: config.get("glpi.requestTimeoutMs", { infer: true }),
        maxRedirects: 5,
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    GlpiClient,
    GlpiSessionManager,
    GlpiBootstrapService,
    UsersGlpiRepository,
    CatalogGlpiRepository,
    TicketsGlpiRepository,
    TicketsHistorySqlRepository,
    TicketsMetricsSqlRepository,
    TicketsStatusSqlRepository,
    TicketsCreateSqlRepository,
    UsersTechniciansSqlRepository,
    UsersGroupsSqlRepository,
    UsersProfilesSqlRepository,
    LocationsSqlRepository,
  ],
  exports: [
    GlpiClient,
    GlpiSessionManager,
    GlpiBootstrapService,
    UsersGlpiRepository,
    CatalogGlpiRepository,
    TicketsGlpiRepository,
    TicketsHistorySqlRepository,
    TicketsMetricsSqlRepository,
    TicketsStatusSqlRepository,
    TicketsCreateSqlRepository,
    UsersTechniciansSqlRepository,
    UsersGroupsSqlRepository,
    UsersProfilesSqlRepository,
    LocationsSqlRepository,
  ],
})
export class GlpiModule {}
