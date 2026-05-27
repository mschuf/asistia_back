import {
  Body,
  Controller,
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
import { RolesGuard } from "../../common/guards/roles.guard";
import { Roles } from "../../common/decorators/roles.decorator";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ResponseMessage } from "../../common/interceptors/response-message.decorator";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { TicketsService } from "./tickets.service";
import { CreateTicketDto } from "./dto/create-ticket.dto";
import { UpdateTicketStatusDto } from "./dto/update-ticket-status.dto";
import { AssignTechnicianDto } from "./dto/assign-technician.dto";
import { ListTicketsQueryDto } from "./dto/list-tickets-query.dto";
import {
  CreateTicketResponseDto,
  TicketListResponseDto,
  TicketResponseDto,
} from "./dto/ticket.response.dto";

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
    return this.ticketsService.updateStatus(user, id, dto.status);
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
