/**
 * @file proveedores.module.ts
 * @description Módulo NestJS que registra el CRUD de proveedores y su repositorio SQL.
 */
import { Module } from "@nestjs/common";
import { PorteriaGuard } from "../../common/guards/porteria.guard";
import { ProveedoresController } from "./proveedores.controller";
import { ProveedoresService } from "./proveedores.service";
import { ProveedoresSqlRepository } from "./repositories/proveedores.sql-repository";

/** Registra controlador, servicio y repositorio de proveedores. */
@Module({
  controllers: [ProveedoresController],
  providers: [ProveedoresService, ProveedoresSqlRepository, PorteriaGuard],
  exports: [ProveedoresService, ProveedoresSqlRepository],
})
export class ProveedoresModule {}
