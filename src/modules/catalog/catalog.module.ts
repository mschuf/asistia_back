/**
 * @file catalog.module.ts
 * @description Módulo NestJS que expone el servicio y controlador de catálogo GLPI.
 */
import { Module } from "@nestjs/common";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";

/** Registra controlador, servicio y exporta el servicio de catálogo. */
@Module({
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
