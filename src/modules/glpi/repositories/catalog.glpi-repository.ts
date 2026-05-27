import { Injectable } from "@nestjs/common";
import { GlpiClient } from "../glpi.client";
import { GLPI_ENDPOINTS } from "../glpi.constants";
import { CategoryMapper, type DomainCategory } from "../mappers/category.mapper";
import { LocationMapper, type DomainLocation } from "../mappers/location.mapper";
import { GroupMapper, type DomainGroup } from "../mappers/group.mapper";
import type {
  GlpiGroupRaw,
  GlpiItilCategoryRaw,
  GlpiLocationRaw,
} from "../glpi.types";

@Injectable()
export class CatalogGlpiRepository {
  constructor(private readonly glpi: GlpiClient) {}

  async listCategories(sessionKey: string): Promise<DomainCategory[]> {
    const response = await this.glpi.request<GlpiItilCategoryRaw[]>({
      method: "GET",
      path: GLPI_ENDPOINTS.ITIL_CATEGORY,
      sessionKey,
      query: { range: "0-499", expand_dropdowns: false },
    });
    const list = Array.isArray(response.data) ? response.data : [];
    return list.map(CategoryMapper.toDomain);
  }

  async listLocations(sessionKey: string): Promise<DomainLocation[]> {
    const response = await this.glpi.request<GlpiLocationRaw[]>({
      method: "GET",
      path: GLPI_ENDPOINTS.LOCATION,
      sessionKey,
      query: { range: "0-499" },
    });
    const list = Array.isArray(response.data) ? response.data : [];
    return list.map(LocationMapper.toDomain);
  }

  async listGroups(sessionKey: string): Promise<DomainGroup[]> {
    const response = await this.glpi.request<GlpiGroupRaw[]>({
      method: "GET",
      path: GLPI_ENDPOINTS.GROUP,
      sessionKey,
      query: { range: "0-499" },
    });
    const list = Array.isArray(response.data) ? response.data : [];
    return list.map(GroupMapper.toDomain);
  }
}
