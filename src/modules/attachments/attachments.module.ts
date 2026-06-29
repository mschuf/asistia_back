/**
 * @file attachments.module.ts
 * @description Módulo NestJS que registra controlador, servicios y configuración Multer para adjuntos.
 */
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MulterModule } from "@nestjs/platform-express";
import { join, resolve } from "path";
import type { AppConfig } from "../../config/configuration";
import { TicketsModule } from "../tickets/tickets.module";
import { LocalAttachmentStorage } from "./local-attachment.storage";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentsService } from "./attachments.service";
import { buildMulterOptions } from "./multer.config";
import { AttachmentsSqlRepository } from "./repositories/attachments.sql-repository";

/**
 * Módulo de adjuntos de tickets con almacenamiento local y persistencia en Postgres.
 */
@Module({
  imports: [
    TicketsModule,
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) =>
        buildMulterOptions({
          maxBytes: config.get("attachments.maxBytes", { infer: true }),
          tempDir: join(
            resolve(config.get("attachments.storagePath", { infer: true })),
            ".tmp",
          ),
        }),
    }),
  ],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, AttachmentsSqlRepository, LocalAttachmentStorage],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
