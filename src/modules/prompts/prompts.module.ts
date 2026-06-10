/**
 * @file prompts.module.ts
 * @description Módulo NestJS que registra el CRUD de prompts y su repositorio SQL.
 */
import { Module } from "@nestjs/common";
import { SuperAdminGuard } from "../../common/guards/super-admin.guard";
import { PromptsController } from "./prompts.controller";
import { PromptsService } from "./prompts.service";
import { PromptsSqlRepository } from "./repositories/prompts.sql-repository";

/** Registra controlador, servicio, repositorio y guarda de super admin. */
@Module({
  controllers: [PromptsController],
  providers: [PromptsService, PromptsSqlRepository, SuperAdminGuard],
  exports: [PromptsService],
})
export class PromptsModule {}
