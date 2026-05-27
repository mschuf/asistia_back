import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { MulterModule } from "@nestjs/platform-express";
import type { AppConfig } from "../../config/configuration";
import { AttachmentsController } from "./attachments.controller";
import { AttachmentsService } from "./attachments.service";
import { buildMulterOptions } from "./multer.config";

@Module({
  imports: [
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) =>
        buildMulterOptions({
          maxBytes: config.get("attachments.maxBytes", { infer: true }),
          allowedMime: config.get("attachments.allowedMime", { infer: true }),
        }),
    }),
  ],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
