import { Module } from "@nestjs/common";
import { SuperAdminGuard } from "../../common/guards/super-admin.guard";
import { PromptsController } from "./prompts.controller";
import { PromptsService } from "./prompts.service";
import { PromptsSqlRepository } from "./repositories/prompts.sql-repository";

@Module({
  controllers: [PromptsController],
  providers: [PromptsService, PromptsSqlRepository, SuperAdminGuard],
  exports: [PromptsService],
})
export class PromptsModule {}
