/**
 * @file tickets.module.ts
 * @description Módulo NestJS que registra controlador, servicio y dependencias del dominio de tickets.
 */
import { Module } from "@nestjs/common";
import { TicketsAccessGuard } from "../../common/guards/tickets-access.guard";
import { AuthModule } from "../auth/auth.module";
import { CatalogModule } from "../catalog/catalog.module";
import { UsersModule } from "../users/users.module";
import { MysqlModule } from "../mysql/mysql.module";
import { TicketsController } from "./tickets.controller";
import { TicketsService } from "./tickets.service";

/**
 * Agrupa el controlador y servicio de tickets con sus módulos de soporte.
 */
@Module({
  imports: [AuthModule, CatalogModule, UsersModule, MysqlModule],
  controllers: [TicketsController],
  providers: [TicketsService, TicketsAccessGuard],
  exports: [TicketsService],
})
export class TicketsModule {}
