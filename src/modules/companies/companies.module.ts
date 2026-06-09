import { Module } from "@nestjs/common";
import { SuperAdminGuard } from "../../common/guards/super-admin.guard";
import { CompaniesController } from "./companies.controller";
import { CompaniesService } from "./companies.service";
import { CompaniesSqlRepository } from "./repositories/companies.sql-repository";

@Module({
  controllers: [CompaniesController],
  providers: [CompaniesService, CompaniesSqlRepository, SuperAdminGuard],
  exports: [CompaniesService],
})
export class CompaniesModule {}
