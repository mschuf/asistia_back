/**
 * @file attachments.controller.ts
 * @description Expone endpoints REST para subir, listar y descargar adjuntos de tickets.
 */
import {
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import { unlink } from "fs/promises";
import { JwtAuthGuard } from "../../common/guards/auth.guard";
import { TicketsAccessGuard } from "../../common/guards/tickets-access.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { ResponseMessage, SkipResponseEnvelope } from "../../common/interceptors/response-message.decorator";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import type { AuthenticatedUser } from "../../common/types/authenticated-user";
import { AttachmentsService } from "./attachments.service";
import { TicketAttachmentResponseDto } from "./dto/attachment.response.dto";

/**
 * Controlador HTTP de adjuntos asociados a tickets.
 */
@ApiTags("attachments")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TicketsAccessGuard)
@Controller("tickets/:id/attachments")
export class AttachmentsController {
  /**
   * Inyecta el servicio de adjuntos.
   * @param attachments - Servicio de lógica de adjuntos.
   */
  constructor(private readonly attachments: AttachmentsService) {}

  /**
   * Sube un archivo adjunto al ticket indicado vía multipart/form-data.
   * @param user - Usuario autenticado.
   * @param ticketId - ID del ticket destino.
   * @param file - Archivo recibido por Multer bajo el campo `file`.
   * @returns DTO del adjunto creado.
   * @throws {BusinessException} Si no se recibió archivo o falla la subida.
   */
  @Post()
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary" },
      },
    },
  })
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({
    summary: "Upload an attachment for a ticket (PNG/JPG/TXT/MD/PDF, max 50 MB)",
  })
  @ApiResponse({ status: 201, type: TicketAttachmentResponseDto })
  @ResponseMessage("Attachment uploaded")
  async upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseIntPipe) ticketId: number,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<TicketAttachmentResponseDto> {
    if (!file?.path) {
      throw new BusinessException({
        message: "No file received under field 'file'",
        code: API_ERROR_CODE.VALIDATION,
        status: HttpStatus.BAD_REQUEST,
      });
    }

    try {
      return await this.attachments.uploadForTicket(user, ticketId, {
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        path: file.path,
      });
    } catch (error) {
      await unlink(file.path).catch(() => undefined);
      throw error;
    }
  }

  /**
   * Lista los adjuntos de un ticket.
   * @param user - Usuario autenticado.
   * @param ticketId - ID del ticket.
   * @returns Colección de DTOs de adjuntos.
   * @throws {BusinessException} Si el usuario no tiene acceso al ticket.
   */
  @Get()
  @ApiOperation({ summary: "List attachments for a ticket" })
  @ApiResponse({ status: 200, type: TicketAttachmentResponseDto, isArray: true })
  @ResponseMessage("Attachments retrieved")
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseIntPipe) ticketId: number,
  ): Promise<TicketAttachmentResponseDto[]> {
    return this.attachments.listForTicket(user, ticketId);
  }

  /**
   * Descarga un adjunto como stream binario con cabeceras de contenido adecuadas.
   * @param user - Usuario autenticado.
   * @param ticketId - ID del ticket.
   * @param attachmentId - ID del adjunto a descargar.
   * @param res - Respuesta Express para escribir el stream.
   * @returns Promesa vacía; el cuerpo se envía por pipe del stream.
   * @throws {BusinessException} Si el usuario no tiene acceso o el adjunto no existe.
   */
  @Get(":attachmentId/download")
  @SkipResponseEnvelope()
  @ApiOperation({ summary: "Download a ticket attachment" })
  @ApiResponse({ status: 200, description: "Binary file stream" })
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseIntPipe) ticketId: number,
    @Param("attachmentId", ParseIntPipe) attachmentId: number,
    @Res() res: Response,
  ): Promise<void> {
    const payload = await this.attachments.resolveDownload(user, ticketId, attachmentId);
    res.setHeader("Content-Type", payload.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(payload.filename)}`,
    );
    if (payload.size > 0) {
      res.setHeader("Content-Length", String(payload.size));
    }
    payload.stream.on("error", () => {
      if (!res.headersSent) {
        res.status(HttpStatus.NOT_FOUND).end();
        return;
      }
      res.end();
    });
    payload.stream.pipe(res);
  }
}
