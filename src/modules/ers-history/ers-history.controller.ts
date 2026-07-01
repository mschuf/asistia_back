/**
 * @file ers-history.controller.ts
 * @description Endpoints de consulta de historial ERS.
 */
import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { ResponseMessage } from "../../common/interceptors/response-message.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { ErsHistoryListResponseDto } from "./dto/ers-history.response.dto";
import { ListErsHistoryQueryDto } from "./dto/list-ers-history-query.dto";
import { ErsHistoryService } from "./ers-history.service";

/** Controlador de historial ERS protegido por JWT y roles. */
@ApiTags("ers-history")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("ers")
export class ErsHistoryController {
  constructor(private readonly ersHistoryService: ErsHistoryService) {}

  /**
   * Lista eventos de historial por proyecto ERS.
   * @param user - Usuario autenticado.
   * @param projectId - ID del proyecto.
   * @param query - Paginación.
   * @returns Historial paginado.
   */
  @Get(":projectId/history")
  @ApiOperation({ summary: "List ERS project history" })
  @ApiResponse({ status: 200, type: ErsHistoryListResponseDto })
  @ResponseMessage("Historial del proyecto ERS obtenido")
  async listByProject(
    @CurrentUser() user: AuthenticatedUser,
    @Param("projectId", ParseIntPipe) projectId: number,
    @Query() query: ListErsHistoryQueryDto,
  ): Promise<ErsHistoryListResponseDto> {
    return this.ersHistoryService.listByProject(user, projectId, query);
  }
}

