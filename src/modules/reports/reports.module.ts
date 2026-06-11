/**
 * @file reports.module.ts
 * @description Módulo NestJS que registra reportes superadmin y su repositorio SQL.
 */
import { Module } from "@nestjs/common";
import { SuperAdminGuard } from "../../common/guards/super-admin.guard";
import { TicketCreatedLogsSqlRepository } from "./repositories/ticket-created-logs.sql-repository";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { TicketCreatedLogsExportService } from "./ticket-created-logs-export.service";

/** Registra controlador, servicio, repositorio y guarda de super admin. */
@Module({
  controllers: [ReportsController],
  providers: [
    ReportsService,
    TicketCreatedLogsSqlRepository,
    TicketCreatedLogsExportService,
    SuperAdminGuard,
  ],
  exports: [ReportsService],
})
export class ReportsModule {}
