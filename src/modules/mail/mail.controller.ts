import { Body, Controller, Get, HttpCode, HttpStatus, NotFoundException, Post } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Public } from "../../common/decorators/public.decorator";
import { ResponseMessage, SkipResponseEnvelope } from "../../common/interceptors/response-message.decorator";
import { RequestTimeoutMs } from "../../common/interceptors/request-timeout.decorator";
import { METRICS_HTTP_TIMEOUT_MS } from "../../common/interceptors/timeout.interceptor";
import type { AppConfig } from "../../config/configuration";
import { CatalogService } from "../catalog/catalog.service";
import { CategoryResponseDto } from "../catalog/dto/category.response.dto";
import { SendMailDto } from "./dto/send-mail.dto";
import { MailDispatchService } from "./mail-dispatch.service";

@ApiTags("mail")
@Controller("mail")
export class MailController {
  constructor(
    private readonly mailDispatch: MailDispatchService,
    private readonly catalog: CatalogService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private assertMailTestEnabled(): void {
    if (!this.config.get("mail.testEndpointEnabled", { infer: true })) {
      throw new NotFoundException();
    }
  }

  @Public()
  @Get("categories")
  @ApiOperation({
    summary: "List ITIL categories for mail test (no auth)",
    description:
      "Solo disponible con MAIL_TEST_ENDPOINT_ENABLED=true. Misma lista que GET /categories pero sin JWT.",
  })
  @ApiResponse({ status: 200, type: [CategoryResponseDto] })
  @ResponseMessage("Categories retrieved")
  async categories(): Promise<CategoryResponseDto[]> {
    this.assertMailTestEnabled();
    return this.catalog.listCategories();
  }

  @Public()
  @Post("send")
  @HttpCode(HttpStatus.OK)
  @SkipResponseEnvelope()
  @RequestTimeoutMs(METRICS_HTTP_TIMEOUT_MS)
  @ApiOperation({
    summary: "Create ticket from inbound mail payload and send ticket-created emails",
    description:
      "Endpoint público (sin JWT ni API key). Acepta email, description, categoryId y type opcional (incident|request; default request). Crea ticket en GLPI y envía correos vía SMTP de forma síncrona. Devuelve 200 con body vacío si todos los correos se envían; 502 si el ticket se creó pero falló el envío.",
  })
  @ApiResponse({ status: 200, description: "Body vacío." })
  @ApiResponse({
    status: 502,
    description: "Ticket creado en GLPI pero falló el envío SMTP (code MAIL_SEND_FAILED).",
  })
  async send(@Body() dto: SendMailDto): Promise<void> {
    this.assertMailTestEnabled();
    await this.mailDispatch.send(dto);
  }
}

