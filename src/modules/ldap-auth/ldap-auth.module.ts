/**
 * @file ldap-auth.module.ts
 * @description Módulo NestJS del endpoint legacy de autenticación LDAP directa.
 */
import { Module } from "@nestjs/common";
import { LdapAuthController } from "./ldap-auth.controller";
import { LdapAuthService } from "./ldap-auth.service";

/**
 * Registra controlador y servicio de autenticación LDAP sin integración GLPI.
 */
@Module({
  controllers: [LdapAuthController],
  providers: [LdapAuthService],
  exports: [LdapAuthService],
})
export class LdapAuthModule {}
