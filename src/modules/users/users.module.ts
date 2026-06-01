import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CatalogModule } from "../catalog/catalog.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  imports: [CatalogModule, AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
