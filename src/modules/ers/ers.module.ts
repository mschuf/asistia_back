/**
 * @file ers.module.ts
 * @description Módulo ERS para escalado de ticket a proyecto GLPI.
 */
import { Module } from "@nestjs/common";
import { CatalogModule } from "../catalog/catalog.module";
import { MysqlModule } from "../mysql/mysql.module";
import { ErsController } from "./ers.controller";
import { ErsService } from "./ers.service";
import { ErsSqlRepository } from "./repositories/ers.sql-repository";

@Module({
  imports: [MysqlModule, CatalogModule],
  controllers: [ErsController],
  providers: [ErsService, ErsSqlRepository],
  exports: [ErsService],
})
export class ErsModule {}

