import { HttpStatus, Injectable } from "@nestjs/common";
import type { PaginatedResult } from "../../common/dto/pagination.dto";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import type { CreateCompanyInput, UpdateCompanyInput } from "./companies.types";
import type { CompanyResponseDto } from "./dto/company.response.dto";
import { CreateCompanyDto } from "./dto/create-company.dto";
import {
  DEFAULT_COMPANIES_PAGE_LIMIT,
  type ListCompaniesQueryDto,
} from "./dto/list-companies-query.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";
import { mapCompanyRowToResponse } from "./mappers/company.mapper";
import { CompaniesSqlRepository } from "./repositories/companies.sql-repository";

@Injectable()
export class CompaniesService {
  constructor(private readonly repo: CompaniesSqlRepository) {}

  async list(query: ListCompaniesQueryDto): Promise<PaginatedResult<CompanyResponseDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? DEFAULT_COMPANIES_PAGE_LIMIT;
    const result = await this.repo.findAll({
      page,
      limit,
      search: query.search,
      activeOnly: query.activeOnly,
    });

    return {
      items: result.items.map(mapCompanyRowToResponse),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  async findById(id: number): Promise<CompanyResponseDto> {
    const company = await this.repo.findById(id);
    if (!company) {
      throw new BusinessException({
        message: `Company ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return mapCompanyRowToResponse(company);
  }

  async create(dto: CreateCompanyDto): Promise<CompanyResponseDto> {
    const input: CreateCompanyInput = {
      name: dto.name.trim(),
      isActive: dto.isActive ?? true,
      msTenantId: dto.msTenantId,
      msClientId: dto.msClientId,
      msClientSecret: dto.msClientSecret,
      msMailbox: dto.msMailbox.trim(),
      msMailFolder: dto.msMailFolder?.trim() || "inbox",
      geminiModel: dto.geminiModel?.trim() || "gemini-3-flash-preview",
      daemonMaxEmails: dto.daemonMaxEmails ?? 20,
      daemonIntervalSeconds: dto.daemonIntervalSeconds ?? 60,
    };

    const created = await this.repo.create(input);
    return mapCompanyRowToResponse(created);
  }

  async update(id: number, dto: UpdateCompanyDto): Promise<CompanyResponseDto> {
    await this.ensureExists(id);

    const input: UpdateCompanyInput = {};
    if (dto.name !== undefined) input.name = dto.name.trim();
    if (dto.isActive !== undefined) input.isActive = dto.isActive;
    if (dto.msTenantId !== undefined) input.msTenantId = dto.msTenantId;
    if (dto.msClientId !== undefined) input.msClientId = dto.msClientId;
    if (dto.msClientSecret !== undefined && dto.msClientSecret.trim()) {
      input.msClientSecret = dto.msClientSecret;
    }
    if (dto.msMailbox !== undefined) input.msMailbox = dto.msMailbox.trim();
    if (dto.msMailFolder !== undefined) input.msMailFolder = dto.msMailFolder.trim();
    if (dto.geminiModel !== undefined) input.geminiModel = dto.geminiModel.trim();
    if (dto.daemonMaxEmails !== undefined) input.daemonMaxEmails = dto.daemonMaxEmails;
    if (dto.daemonIntervalSeconds !== undefined) {
      input.daemonIntervalSeconds = dto.daemonIntervalSeconds;
    }

    const updated = await this.repo.update(id, input);
    if (!updated) {
      throw new BusinessException({
        message: `Company ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return mapCompanyRowToResponse(updated);
  }

  async deactivate(id: number): Promise<CompanyResponseDto> {
    await this.ensureExists(id);
    const updated = await this.repo.softDelete(id);
    if (!updated) {
      throw new BusinessException({
        message: `Company ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return mapCompanyRowToResponse(updated);
  }

  async activate(id: number): Promise<CompanyResponseDto> {
    await this.ensureExists(id);
    const updated = await this.repo.activate(id);
    if (!updated) {
      throw new BusinessException({
        message: `Company ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return mapCompanyRowToResponse(updated);
  }

  async deletePermanent(id: number): Promise<{ id: number; deleted: true }> {
    await this.ensureExists(id);
    const deletedId = await this.repo.hardDelete(id);
    if (deletedId == null) {
      throw new BusinessException({
        message: `Company ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    return { id: deletedId, deleted: true };
  }

  private async ensureExists(id: number): Promise<void> {
    const company = await this.repo.findById(id);
    if (!company) {
      throw new BusinessException({
        message: `Company ${id} not found`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }
  }
}
