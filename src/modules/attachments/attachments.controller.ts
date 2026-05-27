import {
  Controller,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/auth.guard";
import { ResponseMessage } from "../../common/interceptors/response-message.decorator";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import type { AppConfig } from "../../config/configuration";
import { AttachmentsService } from "./attachments.service";

@ApiTags("attachments")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("tickets/:id/attachments")
export class AttachmentsController {
  constructor(
    private readonly attachments: AttachmentsService,
    @Inject(ConfigService)
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

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
  @ApiOperation({ summary: "Upload an image attachment for a ticket (PNG/JPEG/WEBP, 5 MB)" })
  @ApiResponse({ status: 201 })
  @ResponseMessage("Attachment uploaded")
  async upload(
    @Param("id", ParseIntPipe) ticketId: number,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BusinessException({
        message: "No file received under field 'file'",
        code: API_ERROR_CODE.VALIDATION,
        status: HttpStatus.BAD_REQUEST,
      });
    }

    const allowed = this.config.get("attachments.allowedMime", { infer: true });
    const maxBytes = this.config.get("attachments.maxBytes", { infer: true });

    if (!allowed.includes(file.mimetype)) {
      throw new BusinessException({
        message: `Attachment type ${file.mimetype} is not allowed`,
        code: API_ERROR_CODE.ATTACHMENT_TYPE_NOT_ALLOWED,
        status: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      });
    }
    if (file.size > maxBytes) {
      throw new BusinessException({
        message: `Attachment exceeds the maximum size of ${maxBytes} bytes`,
        code: API_ERROR_CODE.ATTACHMENT_TOO_LARGE,
        status: HttpStatus.PAYLOAD_TOO_LARGE,
      });
    }

    return this.attachments.uploadForTicket(ticketId, {
      originalname: file.originalname,
      mimetype: file.mimetype,
      buffer: file.buffer,
      size: file.size,
    });
  }
}
