import { HttpStatus, Injectable } from "@nestjs/common";
import { BusinessException } from "../../common/exceptions/business.exception";
import { API_ERROR_CODE } from "../../common/types/api-error-code";
import { LdapProvider } from "../auth/strategies/ldap.provider";
import { CatalogService } from "../catalog/catalog.service";
import { normalizeLocationId } from "../tickets/domain/ticket-metrics.helpers";
import { TicketsService } from "../tickets/tickets.service";
import { UsersService } from "../users/users.service";
import type { SendMailDto } from "./dto/send-mail.dto";
import { MailListener } from "./mail.listener";

interface ResolvedRequester {
  userId: number | null;
  name: string;
  email: string;
  source: "glpi" | "ldap";
  locationId: number | null;
}

@Injectable()
export class MailDispatchService {
  constructor(
    private readonly tickets: TicketsService,
    private readonly users: UsersService,
    private readonly ldap: LdapProvider,
    private readonly catalog: CatalogService,
    private readonly mailListener: MailListener,
  ) {}

  async send(dto: SendMailDto): Promise<void> {
    const requester = await this.resolveRequester(dto.email);
    const category = await this.resolveCategory(dto.categoryId);

    const created = await this.tickets.createFromInbound({
      requesterId: requester.userId,
      requesterName: requester.name,
      requesterEmail: requester.email,
      categoryId: category.id,
      categoryName: category.name,
      description: dto.description,
      locationId: requester.locationId ?? undefined,
      type: dto.type,
    });

    const mailResult = await this.mailListener.dispatchTicketCreated(created.mailEvent);
    if (!mailResult.sent) {
      throw new BusinessException({
        message: mailResult.error ?? "Mail dispatch failed",
        code: API_ERROR_CODE.MAIL_SEND_FAILED,
        status: HttpStatus.BAD_GATEWAY,
        details: {
          ticketId: created.id,
          error: mailResult.error,
          userMailSent: mailResult.userMailSent,
          supportMailSent: mailResult.supportMailSent,
        },
      });
    }
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
        locationId: normalizeLocationId(glpiUser.locationId),
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
      locationId: normalizeLocationId(enriched?.locationId),
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
