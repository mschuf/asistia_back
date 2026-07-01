/**
 * @file ers-history.module.ts
 * @description Módulo de historial informativo para proyectos ERS.
 */
import { Module } from "@nestjs/common";
import { MysqlModule } from "../mysql/mysql.module";
import { ErsHistoryController } from "./ers-history.controller";
import { ErsHistoryService } from "./ers-history.service";
import { ErsHistorySqlRepository } from "./repositories/ers-history.sql-repository";

@Module({
  imports: [MysqlModule],
  controllers: [ErsHistoryController],
  providers: [ErsHistoryService, ErsHistorySqlRepository],
  exports: [ErsHistoryService],
})
export class ErsHistoryModule {}

