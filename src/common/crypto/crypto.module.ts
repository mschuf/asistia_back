/**
 * @file crypto.module.ts
 * @description Módulo global de cifrado RSA para contraseñas en tránsito desde el cliente.
 */
import { Global, Module } from "@nestjs/common";
import { CryptoService } from "./crypto.service";

/**
 * Expone {@link CryptoService} de forma global en la aplicación.
 */
@Global()
@Module({
  providers: [CryptoService],
  exports: [CryptoService],
})
export class CryptoModule {}
