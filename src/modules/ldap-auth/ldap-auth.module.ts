import { Module } from "@nestjs/common";
import { LdapAuthController } from "./ldap-auth.controller";
import { LdapAuthService } from "./ldap-auth.service";

@Module({
  controllers: [LdapAuthController],
  providers: [LdapAuthService],
  exports: [LdapAuthService],
})
export class LdapAuthModule {}
