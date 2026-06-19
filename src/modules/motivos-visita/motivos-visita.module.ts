/**
 * @file motivos-visita.module.ts
 * @description Módulo NestJS que registra el CRUD de motivos de visita y su repositorio SQL.
 */
import { Module } from "@nestjs/common";
import { PorteriaGuard } from "../../common/guards/porteria.guard";
import { MotivosVisitaController } from "./motivos-visita.controller";
import { MotivosVisitaService } from "./motivos-visita.service";
import { MotivosVisitaSqlRepository } from "./repositories/motivos-visita.sql-repository";

/** Registra controlador, servicio y repositorio de motivos de visita. */
@Module({
  controllers: [MotivosVisitaController],
  providers: [MotivosVisitaService, MotivosVisitaSqlRepository, PorteriaGuard],
  exports: [MotivosVisitaService, MotivosVisitaSqlRepository],
})
export class MotivosVisitaModule {}
