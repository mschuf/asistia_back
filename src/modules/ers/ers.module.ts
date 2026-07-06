/**
 * @file ers.module.ts
 * @description Módulo ERS para escalado de ticket a proyecto GLPI.
 */
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MulterModule } from "@nestjs/platform-express";
import { join, resolve } from "path";
import type { AppConfig } from "../../config/configuration";
import { CatalogModule } from "../catalog/catalog.module";
import { ErsHistoryModule } from "../ers-history/ers-history.module";
import { MysqlModule } from "../mysql/mysql.module";
import { ErsController } from "./ers.controller";
import { ErsDocumentsService } from "./ers-documents.service";
import { buildErsDocumentsMulterOptions } from "./ers-documents.multer";
import { ErsService } from "./ers.service";
import { ErsDocumentsSqlRepository } from "./repositories/ers-documents.sql-repository";
import { ErsSqlRepository } from "./repositories/ers.sql-repository";

@Module({
  imports: [
    MysqlModule,
    CatalogModule,
    ErsHistoryModule,
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) =>
        buildErsDocumentsMulterOptions(
          join(resolve(config.get("attachments.storagePath", { infer: true })), ".tmp", "ers-documents"),
          config.get("attachments.maxBytes", { infer: true }),
        ),
    }),
  ],
  controllers: [ErsController],
  providers: [ErsService, ErsDocumentsService, ErsSqlRepository, ErsDocumentsSqlRepository],
  exports: [ErsService],
})
export class ErsModule {}

