/**
 * @file ai.controller.ts
 * @description Endpoints HTTP del módulo de IA: health y chat (no implementado).
 */
import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { ResponseMessage } from "../../common/interceptors/response-message.decorator";
import { AiService } from "./ai.service";
import { ChatRequestDto } from "./dto/chat-request.dto";
import { AiHealthResponseDto, ChatResponseDto } from "./dto/chat-response.dto";

/** Controlador REST del módulo de IA. */
@ApiTags("ai")
@ApiBearerAuth()
@Controller("ai")
export class AiController {
  /**
   * Inyecta el servicio de IA.
   * @param aiService - Servicio de health y chat.
   */
  constructor(private readonly aiService: AiService) {}

  /**
   * Comprueba el estado del módulo de IA.
   * @returns Respuesta de health del módulo.
   */
  @Get("health")
  @ApiOperation({ summary: "AI module health check" })
  @ApiResponse({ status: 200, type: AiHealthResponseDto })
  @ResponseMessage("AI module health")
  health(): AiHealthResponseDto {
    return this.aiService.health();
  }

  /**
   * Envía un mensaje al asistente de IA (aún no implementado).
   * @param dto - Mensaje y sesión opcional del cliente.
   * @returns Respuesta del asistente cuando esté disponible.
   * @throws {BusinessException} Con código NOT_IMPLEMENTED en el MVP.
   */
  @Post("chat")
  @ApiOperation({ summary: "Chat with the AI assistant (not implemented yet)" })
  @ApiResponse({ status: 501, type: ChatResponseDto })
  @ResponseMessage("AI chat")
  chat(@Body() dto: ChatRequestDto): Promise<ChatResponseDto> {
    return this.aiService.chat(dto);
  }
}
