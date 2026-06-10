/**
 * @file companies.module.ts
 * @description Módulo NestJS que registra el CRUD de empresas y su repositorio SQL.
 */
import { Module } from "@nestjs/common";
import { SuperAdminGuard } from "../../common/guards/super-admin.guard";
import { CompaniesController } from "./companies.controller";
import { CompaniesService } from "./companies.service";
import { CompaniesSqlRepository } from "./repositories/companies.sql-repository";

/** Registra controlador, servicio, repositorio y guarda de super admin. */
@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService, CompaniesSqlRepository, SuperAdminGuard],
  exports: [CompaniesService],
})
export class CompaniesModule {}
