import { Injectable } from "@nestjs/common";
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from "@nestjs/terminus";
import { MailService } from "../../mail/mail.service";

@Injectable()
export class SmtpHealthIndicator extends HealthIndicator {
  constructor(private readonly mail: MailService) {
    super();
  }

  async isHealthy(key = "smtp"): Promise<HealthIndicatorResult> {
    if (!this.mail.isEnabled()) {
      return this.getStatus(key, true, { enabled: false });
    }
    const ok = await this.mail.verify();
    const result = this.getStatus(key, ok, { enabled: true });
    if (!ok) {
      throw new HealthCheckError(`${key} unavailable`, result);
    }
    return result;
  }
}
