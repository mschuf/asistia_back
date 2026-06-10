/**
 * @file cache.module.ts
 * @description Módulo global de caché en memoria para catálogos y sesiones GLPI.
 */
import { Global, Module } from "@nestjs/common";
import { InMemoryCacheService } from "./cache.service";

/**
 * Expone {@link InMemoryCacheService} de forma global en la aplicación.
 */
@Global()
@Module({
  providers: [InMemoryCacheService],
  exports: [InMemoryCacheService],
})
export class CacheModule {}
