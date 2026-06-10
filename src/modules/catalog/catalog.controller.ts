/**
 * @file catalog.controller.ts
 * @description Endpoints HTTP de catálogo ITIL: categorías, ubicaciones y grupos.
 */
import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/auth.guard";
import { ResponseMessage } from "../../common/interceptors/response-message.decorator";
import { CatalogService } from "./catalog.service";
import { CategoryResponseDto } from "./dto/category.response.dto";
import { LocationResponseDto } from "./dto/location.response.dto";
import { GroupResponseDto } from "./dto/group.response.dto";
import { ListLocationsQueryDto } from "./dto/list-locations-query.dto";

/** Controlador REST del catálogo GLPI cacheado. */
@ApiTags("catalog")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class CatalogController {
  /**
   * Inyecta el servicio de catálogo.
   * @param catalog - Servicio de lectura de catálogos GLPI.
   */
  constructor(private readonly catalog: CatalogService) {}

  /**
   * Lista categorías ITIL cacheadas.
   * @returns Arreglo de categorías para la API.
   */
  @Get("categories")
  @ApiOperation({ summary: "List ITIL categories (cached)" })
  @ApiResponse({ status: 200, type: [CategoryResponseDto] })
  @ResponseMessage("Categories retrieved")
  async categories(): Promise<CategoryResponseDto[]> {
    return this.catalog.listCategories();
  }

  /**
   * Lista ubicaciones cacheadas con filtro opcional de activas.
   * @param query - Parámetros de query (`activeOnly`).
   * @returns Arreglo de ubicaciones para la API.
   */
  @Get("locations")
  @ApiOperation({ summary: "List locations (cached)" })
  @ApiResponse({ status: 200, type: [LocationResponseDto] })
  @ResponseMessage("Locations retrieved")
  async locations(@Query() query: ListLocationsQueryDto): Promise<LocationResponseDto[]> {
    return this.catalog.listLocations({ activeOnly: query.activeOnly });
  }

  /**
   * Lista grupos GLPI cacheados.
   * @returns Arreglo de grupos para la API.
   */
  @Get("groups")
  @ApiOperation({ summary: "List groups (cached)" })
  @ApiResponse({ status: 200, type: [GroupResponseDto] })
  @ResponseMessage("Groups retrieved")
  async groups(): Promise<GroupResponseDto[]> {
    return this.catalog.listGroups();
  }
}
