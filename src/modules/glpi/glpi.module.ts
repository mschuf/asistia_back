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
  ],
})
export class GlpiModule {}
