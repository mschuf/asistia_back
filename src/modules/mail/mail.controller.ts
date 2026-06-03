import { Body, Controller, Post } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Public } from "../../common/decorators/public.decorator";
import { ResponseMessage } from "../../common/interceptors/response-message.decorator";
import { RequestTimeoutMs } from "../../common/interceptors/request-timeout.decorator";
import { METRICS_HTTP_TIMEOUT_MS } from "../../common/interceptors/timeout.interceptor";
import { SendMailDto } from "./dto/send-mail.dto";
import { SendMailResponseDto } from "./dto/send-mail.response.dto";
import { MailDispatchService } from "./mail-dispatch.service";

@ApiTags("mail")
@Controller("mail")
export class MailController {
  constructor(private readonly mailDispatch: MailDispatchService) {}

  @Public()
  @Post("send")
  @RequestTimeoutMs(METRICS_HTTP_TIMEOUT_MS)
  @ApiOperation({
    summary: "Send request confirmation and support notification by email",
    description:
      "Endpoint público (sin JWT ni API key). El envío SMTP usa SMTP_USER/SMTP_PASSWORD del .env.",
  })
  @ApiResponse({ status: 200, type: SendMailResponseDto })
  @ResponseMessage("Mail dispatched")
  async send(@Body() dto: SendMailDto): Promise<SendMailResponseDto> {
    return this.mailDispatch.send(dto);
  }
}
