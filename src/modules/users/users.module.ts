/**
 * @file users.module.ts
 * @description Módulo NestJS que expone el servicio y controlador de usuarios GLPI.
 */
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CatalogModule } from "../catalog/catalog.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

/** Registra controlador, servicio y dependencias del módulo de usuarios. */
@Module({
  imports: [CatalogModule, AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
