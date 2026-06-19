/**
 * @file visitas.module.ts
 * @description Módulo NestJS que registra el CRUD de visitas y su repositorio SQL.
 */
import { Module } from "@nestjs/common";
import { PorteriaGuard } from "../../common/guards/porteria.guard";
import { MotivosVisitaModule } from "../motivos-visita/motivos-visita.module";
import { PersonasModule } from "../personas/personas.module";
import { UsersModule } from "../users/users.module";
import { CatalogModule } from "../catalog/catalog.module";
import { VisitaAuditSqlRepository } from "./repositories/visita-audit.sql-repository";
import { VisitasController } from "./visitas.controller";
import { VisitasService } from "./visitas.service";
import { VisitasSqlRepository } from "./repositories/visitas.sql-repository";

/** Registra controlador, servicio y repositorio de visitas. */
@Module({
  imports: [PersonasModule, MotivosVisitaModule, UsersModule, CatalogModule],
  controllers: [VisitasController],
  providers: [VisitasService, VisitasSqlRepository, VisitaAuditSqlRepository, PorteriaGuard],
  exports: [VisitasService, VisitasSqlRepository, VisitaAuditSqlRepository],
})
export class VisitasModule {}
