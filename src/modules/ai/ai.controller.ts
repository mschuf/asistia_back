import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { ResponseMessage } from "../../common/interceptors/response-message.decorator";
import { AiService } from "./ai.service";
import { ChatRequestDto } from "./dto/chat-request.dto";
import { AiHealthResponseDto, ChatResponseDto } from "./dto/chat-response.dto";

@ApiTags("ai")
@ApiBearerAuth()
@Controller("ai")
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get("health")
  @ApiOperation({ summary: "AI module health check" })
  @ApiResponse({ status: 200, type: AiHealthResponseDto })
  @ResponseMessage("AI module health")
  health(): AiHealthResponseDto {
    return this.aiService.health();
  }

  @Post("chat")
  @ApiOperation({ summary: "Chat with the AI assistant (not implemented yet)" })
  @ApiResponse({ status: 501, type: ChatResponseDto })
  @ResponseMessage("AI chat")
  chat(@Body() dto: ChatRequestDto): Promise<ChatResponseDto> {
    return this.aiService.chat(dto);
  }
}
