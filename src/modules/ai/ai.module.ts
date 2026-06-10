/**
 * @file ai.module.ts
 * @description Módulo NestJS que expone el servicio y controlador de IA.
 */
import { Module } from "@nestjs/common";
import { AiController } from "./ai.controller";
import { AiService } from "./ai.service";

/** Registra controlador, servicio y exporta el servicio de IA. */
@Module({
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
