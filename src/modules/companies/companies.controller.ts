/**
 * @file companies.controller.ts
 * @description Endpoints HTTP CRUD de empresas restringidos a super administradores.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { SuperAdmin } from "../../common/decorators/super-admin.decorator";
import { JwtAuthGuard } from "../../common/guards/auth.guard";
import { SuperAdminGuard } from "../../common/guards/super-admin.guard";
import { ResponseMessage } from "../../common/interceptors/response-message.decorator";
import { CompaniesService } from "./companies.service";
import { CreateCompanyDto } from "./dto/create-company.dto";
import { ListCompaniesQueryDto } from "./dto/list-companies-query.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";
import { CompanyListResponseDto, CompanyResponseDto } from "./dto/company.response.dto";
import { CompanyDeleteResponseDto } from "./dto/company-delete.response.dto";

/** Controlador REST de empresas con guardas JWT y super admin. */
@ApiTags("companies")
@ApiBearerAuth()
@SuperAdmin()
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller("companies")
export class CompaniesController {
  /**
   * Inyecta el servicio de empresas.
   * @param companiesService - Servicio de negocio de empresas.
   */
  constructor(private readonly companiesService: CompaniesService) {}

  /**
   * Lista empresas con paginación y búsqueda opcional.
   * @param query - Parámetros de paginación, búsqueda y filtro de activas.
   * @returns Lista paginada de empresas.
   */
  @Get()
  @ApiOperation({ summary: "List companies with pagination and optional search" })
  @ApiResponse({ status: 200, type: CompanyListResponseDto })
  @ResponseMessage("Companies retrieved")
  async list(@Query() query: ListCompaniesQueryDto): Promise<CompanyListResponseDto> {
    return this.companiesService.list(query);
  }

  /**
   * Obtiene una empresa por identificador.
   * @param id - ID numérico de la empresa.
   * @returns DTO de la empresa.
   * @throws {BusinessException} Si la empresa no existe.
   */
  @Get(":id")
  @ApiOperation({ summary: "Get a company by id" })
  @ApiResponse({ status: 200, type: CompanyResponseDto })
  @ResponseMessage("Company retrieved")
  async byId(@Param("id", ParseIntPipe) id: number): Promise<CompanyResponseDto> {
    return this.companiesService.findById(id);
  }

  /**
   * Crea una nueva empresa.
   * @param dto - Datos de creación validados.
   * @returns DTO de la empresa creada.
   */
  @Post()
  @ApiOperation({ summary: "Create a company" })
  @ApiResponse({ status: 201, type: CompanyResponseDto })
  @ResponseMessage("Company created")
  async create(@Body() dto: CreateCompanyDto): Promise<CompanyResponseDto> {
    return this.companiesService.create(dto);
  }

  /**
   * Actualiza parcialmente una empresa existente.
   * @param id - ID de la empresa a modificar.
   * @param dto - Campos a actualizar.
   * @returns DTO de la empresa actualizada.
   * @throws {BusinessException} Si la empresa no existe.
   */
  @Patch(":id")
  @ApiOperation({ summary: "Update a company" })
  @ApiResponse({ status: 200, type: CompanyResponseDto })
  @ResponseMessage("Company updated")
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateCompanyDto,
  ): Promise<CompanyResponseDto> {
    return this.companiesService.update(id, dto);
  }

  /**
   * Reactiva una empresa desactivada.
   * @param id - ID de la empresa.
   * @returns DTO de la empresa activada.
   * @throws {BusinessException} Si la empresa no existe.
   */
  @Patch(":id/activate")
  @ApiOperation({ summary: "Activate a company" })
  @ApiResponse({ status: 200, type: CompanyResponseDto })
  @ResponseMessage("Company activated")
  async activate(@Param("id", ParseIntPipe) id: number): Promise<CompanyResponseDto> {
    return this.companiesService.activate(id);
  }

  /**
   * Desactiva una empresa (borrado lógico).
   * @param id - ID de la empresa.
   * @returns DTO de la empresa desactivada.
   * @throws {BusinessException} Si la empresa no existe.
   */
  @Patch(":id/deactivate")
  @ApiOperation({ summary: "Deactivate a company" })
  @ApiResponse({ status: 200, type: CompanyResponseDto })
  @ResponseMessage("Company deactivated")
  async deactivate(@Param("id", ParseIntPipe) id: number): Promise<CompanyResponseDto> {
    return this.companiesService.deactivate(id);
  }

  /**
   * Elimina permanentemente una empresa.
   * @param id - ID de la empresa.
   * @returns Confirmación con el ID eliminado.
   * @throws {BusinessException} Si la empresa no existe.
   */
  @Delete(":id/permanent")
  @ApiOperation({ summary: "Permanently delete a company" })
  @ApiResponse({ status: 200, type: CompanyDeleteResponseDto })
  @ResponseMessage("Company permanently deleted")
  async deletePermanent(
    @Param("id", ParseIntPipe) id: number,
  ): Promise<CompanyDeleteResponseDto> {
    return this.companiesService.deletePermanent(id);
  }
}
