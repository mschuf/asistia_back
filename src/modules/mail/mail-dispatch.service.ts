import { HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import type { AppConfig } from "../../config/configuration";
import { LdapProvider } from "../auth/strategies/ldap.provider";
import { CatalogService } from "../catalog/catalog.service";
import { UsersService } from "../users/users.service";
import type { SendMailDto } from "./dto/send-mail.dto";
import type { SendMailResponseDto } from "./dto/send-mail.response.dto";
import { MailService } from "./mail.service";
import {
  buildSupportNotificationHtml,
  buildSupportNotificationSubject,
  buildSupportNotificationText,
  buildUserConfirmationHtml,
  buildUserConfirmationSubject,
  buildUserConfirmationText,
  type MailRequestTemplateInput,
} from "./templates/mail-request.template";

interface ResolvedRequester {
  userId: number | null;
  name: string;
  email: string;
  source: "glpi" | "ldap";
}

@Injectable()
export class MailDispatchService {
  constructor(
    private readonly mail: MailService,
    private readonly users: UsersService,
    private readonly ldap: LdapProvider,
    private readonly catalog: CatalogService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async send(dto: SendMailDto): Promise<SendMailResponseDto> {
    const requester = await this.resolveRequester(dto.email);
    const category = await this.resolveCategory(dto.categoryId);
    const templateInput: MailRequestTemplateInput = {
      requesterName: requester.name,
      requesterEmail: requester.email,
      requesterUserId: requester.userId,
      categoryName: category.name,
      description: dto.description.trim(),
    };

    const userResult = await this.mail.send({
      subject: buildUserConfirmationSubject(templateInput),
      html: buildUserConfirmationHtml(templateInput),
      text: buildUserConfirmationText(templateInput),
      recipients: [{ name: requester.name, email: requester.email }],
    });

    const supportEmail = this.config.get("mail.supportTo", { infer: true }).trim();
    let supportMailSent = false;
    let supportError: string | null = null;

    if (supportEmail) {
      const supportResult = await this.mail.send({
        subject: buildSupportNotificationSubject(templateInput),
        html: buildSupportNotificationHtml(templateInput),
        text: buildSupportNotificationText(templateInput),
        recipients: [{ name: "Soporte TI", email: supportEmail }],
      });

      supportMailSent = supportResult.sent;
      supportError = supportResult.error;
    }

    const sent = userResult.sent || supportMailSent;
    const userError = userResult.error;
    const combinedError = [userError, supportError].filter(Boolean).join(" | ") || null;

    if (!sent && combinedError) {
      throw new BusinessException({
        message: combinedError,
        code: API_ERROR_CODE.MAIL_SEND_FAILED,
        status: HttpStatus.BAD_GATEWAY,
      });
    }

    return {
      sent,
      error: combinedError,
      requester: {
        userId: requester.userId,
        name: requester.name,
        email: requester.email,
        source: requester.source,
      },
      category,
      userMailSent: userResult.sent,
      supportMailSent,
    };
  }

  private async resolveRequester(email: string): Promise<ResolvedRequester> {
    const trimmed = email.trim();
    const glpiUser = await this.users.findByEmail(trimmed);
    if (glpiUser) {
      const resolvedEmail = glpiUser.email ?? trimmed;
      return {
        userId: glpiUser.id,
        name: glpiUser.fullName ?? "Usuario",
        email: resolvedEmail,
        source: "glpi",
      };
    }

    const ldapUser = await this.ldap.lookupUserByEmail(trimmed);
    if (!ldapUser) {
      throw new BusinessException({
        message: `No user found for email ${trimmed}`,
        code: API_ERROR_CODE.NOT_FOUND,
        status: HttpStatus.NOT_FOUND,
      });
    }

    const enriched = await this.users.findByLogin(ldapUser.login);
    return {
      userId: enriched?.id ?? null,
      name: enriched?.fullName ?? ldapUser.name,
      email: ldapUser.email,
      source: "ldap",
    };
  }

  private async resolveCategory(
    categoryId: number,
  ): Promise<{ id: number; name: string }> {
    const categories = await this.catalog.listCategories();
    const category = categories.find((entry) => entry.id === categoryId);
    if (!category) {
      throw new BusinessException({
        message: `Category ${categoryId} is not valid`,
        code: API_ERROR_CODE.INVALID_CATEGORY,
        status: HttpStatus.BAD_REQUEST,
      });
    }

    return {
      id: category.id,
      name: category.fullPath || category.name,
    };
  }
}
