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
import { CreatePromptDto } from "./dto/create-prompt.dto";
import { ListPromptsQueryDto } from "./dto/list-prompts-query.dto";
import { PromptDeleteResponseDto } from "./dto/prompt-delete.response.dto";
import { PromptListResponseDto, PromptResponseDto } from "./dto/prompt.response.dto";
import { UpdatePromptDto } from "./dto/update-prompt.dto";
import { PromptsService } from "./prompts.service";

@ApiTags("prompts")
@ApiBearerAuth()
@SuperAdmin()
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller("prompts")
export class PromptsController {
  constructor(private readonly promptsService: PromptsService) {}

  @Get()
  @ApiOperation({ summary: "List prompts with pagination and optional search" })
  @ApiResponse({ status: 200, type: PromptListResponseDto })
  @ResponseMessage("Prompts retrieved")
  async list(@Query() query: ListPromptsQueryDto): Promise<PromptListResponseDto> {
    return this.promptsService.list(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a prompt by id" })
  @ApiResponse({ status: 200, type: PromptResponseDto })
  @ResponseMessage("Prompt retrieved")
  async byId(@Param("id", ParseIntPipe) id: number): Promise<PromptResponseDto> {
    return this.promptsService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: "Create a prompt" })
  @ApiResponse({ status: 201, type: PromptResponseDto })
  @ResponseMessage("Prompt created")
  async create(@Body() dto: CreatePromptDto): Promise<PromptResponseDto> {
    return this.promptsService.create(dto);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update a prompt" })
  @ApiResponse({ status: 200, type: PromptResponseDto })
  @ResponseMessage("Prompt updated")
  async update(
    @Param("id", ParseIntPipe) id: number,
    @Body() dto: UpdatePromptDto,
  ): Promise<PromptResponseDto> {
    return this.promptsService.update(id, dto);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Permanently delete a prompt" })
  @ApiResponse({ status: 200, type: PromptDeleteResponseDto })
  @ResponseMessage("Prompt deleted")
  async delete(@Param("id", ParseIntPipe) id: number): Promise<PromptDeleteResponseDto> {
    return this.promptsService.delete(id);
  }
}
