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
  ],
  exports: [
    GlpiClient,
    GlpiSessionManager,
    GlpiBootstrapService,
    UsersGlpiRepository,
    CatalogGlpiRepository,
    TicketsGlpiRepository,
  ],
})
export class GlpiModule {}
