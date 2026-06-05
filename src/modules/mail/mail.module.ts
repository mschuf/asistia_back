import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CatalogModule } from "../catalog/catalog.module";
import { TicketsModule } from "../tickets/tickets.module";
import { UsersModule } from "../users/users.module";
import { MailController } from "./mail.controller";
import { MailDispatchService } from "./mail-dispatch.service";
import { MailListener } from "./mail.listener";
import { MailService } from "./mail.service";

@Global()
@Module({
  imports: [UsersModule, AuthModule, CatalogModule, TicketsModule],
  controllers: [MailController],
  providers: [MailService, MailListener, MailDispatchService],
  exports: [MailService],
})
export class MailModule {}

