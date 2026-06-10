/**
 * @file catalog.glpi-repository.ts
 * @description Repositorio GLPI para catálogos de categorías, sedes y grupos.
 */
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

/**
 * Acceso REST a catálogos administrativos de GLPI.
 */
@Injectable()
export class CatalogGlpiRepository {
  /** Inyecta el cliente HTTP de GLPI. */
  constructor(private readonly glpi: GlpiClient) {}

  /**
   * Lista categorías ITIL activas del catálogo GLPI.
   * @param sessionKey - Clave de sesión GLPI válida.
   * @returns Categorías mapeadas al dominio.
   * @throws {GlpiException} Si la API de GLPI rechaza la petición.
   */
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

  /**
   * Lista sedes (locations) del catálogo GLPI.
   * @param sessionKey - Clave de sesión GLPI válida.
   * @returns Sedes mapeadas al dominio.
   * @throws {GlpiException} Si la API de GLPI rechaza la petición.
   */
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

  /**
   * Lista grupos del catálogo GLPI.
   * @param sessionKey - Clave de sesión GLPI válida.
   * @returns Grupos mapeados al dominio.
   * @throws {GlpiException} Si la API de GLPI rechaza la petición.
   */
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
