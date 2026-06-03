import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/auth.guard";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ResponseMessage } from "../../common/interceptors/response-message.decorator";
import { RequestTimeoutMs } from "../../common/interceptors/request-timeout.decorator";
import { METRICS_HTTP_TIMEOUT_MS } from "../../common/interceptors/timeout.interceptor";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { TicketsService, type HistoryListMeta } from "./tickets.service";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import { UpdateTicketStatusDto } from "./dto/update-ticket-status.dto";
import { AssignTechnicianDto } from "./dto/assign-technician.dto";
import { ListTicketsQueryDto } from "./dto/list-tickets-query.dto";
import {
  CreateTicketResponseDto,
  TicketListResponseDto,
  TicketResponseDto,
} from "./dto/ticket.response.dto";
import { TicketMetricsResponseDto } from "./dto/ticket-metrics.response.dto";

@ApiTags("tickets")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("tickets")
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Get()
  @ApiOperation({ summary: "List tickets visible to the current user" })
  @ApiResponse({ status: 200, type: TicketListResponseDto })
  @ResponseMessage("Tickets retrieved")
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListTicketsQueryDto,
  ): Promise<TicketListResponseDto> {
    return this.ticketsService.list(user, query);
  }

  @Get("metrics")
  @Roles("technician")
  @RequestTimeoutMs(METRICS_HTTP_TIMEOUT_MS)
  @ApiOperation({ summary: "Aggregated metrics for technicians (TI dashboard)" })
  @ApiResponse({ status: 200, type: TicketMetricsResponseDto })
  @ResponseMessage("Ticket metrics retrieved")
  async metrics(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TicketMetricsResponseDto> {
    return this.ticketsService.getMetrics(user);
  }

  @Get("history")
  @ApiOperation({ summary: "Paginated ticket history for the current user (Historial tab)" })
  @ApiResponse({ status: 200, type: TicketListResponseDto })
  @ResponseMessage("Ticket history retrieved")
  async history(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListTicketsQueryDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TicketListResponseDto> {
    const meta: HistoryListMeta = { source: "glpi-api" };
    const result = await this.ticketsService.listHistory(user, query, meta);
    res.setHeader("X-History-Source", meta.source);
    return result;
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a ticket by id" })
  @ApiResponse({ status: 200, type: TicketResponseDto })
  @ResponseMessage("Ticket retrieved")
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseIntPipe) id: number,
  ): Promise<TicketResponseDto> {
    return this.ticketsService.findById(user, id);
  }

  @Post()
  @ApiOperation({ summary: "Create a new ticket" })
  @ApiResponse({ status: 201, type: CreateTicketResponseDto })
  @ResponseMessage("Ticket created successfully")
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTicketDto,
  ): Promise<CreateTicketResponseDto> {
    return this.ticketsService.create(user, dto);
  }

  @Patch(":id/status")
  @ApiOperation({ summary: "Update the status of a ticket" })
  @ApiResponse({ status: 200, type: TicketResponseDto })
  @ResponseMessage("Ticket status updated")
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdateTicketStatusDto,
  ): Promise<TicketResponseDto> {
    return this.ticketsService.updateStatus(user, id, dto.status, dto.resolutionNote);
  }

  @Post(":id/assign")
  @Roles("technician")
  @ApiOperation({ summary: "Assign a technician to a ticket" })
  @ApiResponse({ status: 200, type: TicketResponseDto })
  @ResponseMessage("Technician assigned")
  async assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: AssignTechnicianDto,
  ): Promise<TicketResponseDto> {
    return this.ticketsService.assignTechnician(user, id, dto.technicianId);
  }
}
