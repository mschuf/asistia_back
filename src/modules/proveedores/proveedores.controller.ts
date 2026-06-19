/**
 * @file proveedores.controller.ts
 * @description Endpoints HTTP CRUD de proveedores para el módulo Portería.
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
import { JwtAuthGuard } from "../../common/guards/auth.guard";
import { PorteriaGuard } from "../../common/guards/porteria.guard";
import { ResponseMessage } from "../../common/interceptors/response-message.decorator";
import { ProveedoresService } from "./proveedores.service";
import { CreateProveedorDto } from "./dto/create-proveedor.dto";
import { ListProveedoresQueryDto } from "./dto/list-proveedores-query.dto";
import { UpdateProveedorDto } from "./dto/update-proveedor.dto";
import { ProveedorListResponseDto, ProveedorResponseDto } from "./dto/proveedor.response.dto";

/** Controlador REST de proveedores con guard JWT. */
@ApiTags("proveedores")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PorteriaGuard)
@Controller("proveedores")
export class ProveedoresController {
  /** Inyecta el servicio de proveedores. */
  constructor(private readonly proveedoresService: ProveedoresService) {}

  /**
   * Lista proveedores con paginación, filtros y orden opcional.
   * @param query - Parámetros de consulta.
   * @returns Lista paginada de proveedores.
   */
  @Get()
  @ApiOperation({ summary: "List proveedores with pagination, filters and sorting" })
  @ApiResponse({ status: 200, type: ProveedorListResponseDto })
  @ResponseMessage("Proveedores retrieved")
  async list(@Query() query: ListProveedoresQueryDto): Promise<ProveedorListResponseDto> {
    return this.proveedoresService.list(query);
  }

  /**
   * Obtiene un proveedor por identificador.
   * @param id - ID numérico del proveedor.
   * @returns DTO del proveedor.
   */
  @Get(":id")
  @ApiOperation({ summary: "Get proveedor by id" })
  @ApiResponse({ status: 200, type: ProveedorResponseDto })
  @ResponseMessage("Proveedor retrieved")
  async findById(@Param("id", ParseIntPipe) id: number): Promise<ProveedorResponseDto> {
    return this.proveedoresService.findById(id);
  }

  /**
   * Crea un proveedor nuevo.
   * @param dto - Datos de creación.
   * @returns DTO del proveedor creado.
   */
  @Post()
  @ApiOperation({ summary: "Create proveedor" })
  @ApiResponse({ status: 201, type: ProveedorResponseDto })
  @ResponseMessage("Proveedor created")
  async create(@Body() dto: CreateProveedorDto): Promise<ProveedorResponseDto> {
    return this.proveedoresService.create(dto);
  }

  /**
   * Actualiza parcialmente un proveedor existente.
   * @param id - ID del proveedor.
   * @param dto - Campos a actualizar.
   * @returns DTO del proveedor actualizado.
   */
  @Patch(":id")
  @ApiOperation({ summary: "Update proveedor" })
  @ApiResponse({ status: 200, type: ProveedorResponseDto })
  @ResponseMessage("Proveedor updated")
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateProveedorDto,
  ): Promise<ProveedorResponseDto> {
    return this.proveedoresService.update(id, dto);
  }

  /**
   * Desactiva un proveedor (soft delete).
   * @param id - ID del proveedor.
   * @returns DTO del proveedor desactivado.
   */
  @Patch(":id/deactivate")
  @ApiOperation({ summary: "Deactivate proveedor" })
  @ApiResponse({ status: 200, type: ProveedorResponseDto })
  @ResponseMessage("Proveedor deactivated")
  async deactivate(@Param("id", ParseIntPipe) id: number): Promise<ProveedorResponseDto> {
    return this.proveedoresService.deactivate(id);
  }

  /**
   * Reactiva un proveedor desactivado.
   * @param id - ID del proveedor.
   * @returns DTO del proveedor activado.
   */
  @Patch(":id/activate")
  @ApiOperation({ summary: "Activate proveedor" })
  @ApiResponse({ status: 200, type: ProveedorResponseDto })
  @ResponseMessage("Proveedor activated")
  async activate(@Param("id", ParseIntPipe) id: number): Promise<ProveedorResponseDto> {
    return this.proveedoresService.activate(id);
  }

  /**
   * Elimina permanentemente un proveedor sin personas asociadas.
   * @param id - ID del proveedor.
   * @returns Confirmación de eliminación.
   */
  @Delete(":id")
  @ApiOperation({ summary: "Permanently delete proveedor" })
  @ResponseMessage("Proveedor deleted")
  async deletePermanent(
    @Param("id", ParseIntPipe) id: number,
  ): Promise<{ id: number; deleted: true }> {
    return this.proveedoresService.deletePermanent(id);
  }
}
