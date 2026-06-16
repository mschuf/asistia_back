/**
 * @file personas.module.ts
 * @description Módulo NestJS que registra el CRUD de personas y su repositorio SQL.
 */
import { Module } from "@nestjs/common";
import { PorteriaGuard } from "../../common/guards/porteria.guard";
import { CatalogModule } from "../catalog/catalog.module";
import { UsersModule } from "../users/users.module";
import { PersonasController } from "./personas.controller";
import { PersonasService } from "./personas.service";
import { PersonasSqlRepository } from "./repositories/personas.sql-repository";

/** Registra controlador, servicio y repositorio de personas. */
@Module({
  imports: [UsersModule, CatalogModule],
  controllers: [PersonasController],
  providers: [PersonasService, PersonasSqlRepository, PorteriaGuard],
  exports: [PersonasService, PersonasSqlRepository],
})
export class PersonasModule {}
