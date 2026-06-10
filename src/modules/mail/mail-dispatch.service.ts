/**
 * @file mail-dispatch.service.ts
 * @description Orquesta la creación de tickets desde correo entrante y el envío síncrono de notificaciones.
 */
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

/** Solicitante resuelto desde GLPI o LDAP con metadatos de ubicación. */
interface ResolvedRequester {
  userId: number | null;
  name: string;
  email: string;
  source: "glpi" | "ldap";
  locationId: number | null;
}

/**
 * Servicio de despacho de correo entrante que crea tickets y exige envío SMTP exitoso.
 */
@Injectable()
export class MailDispatchService {
  /**
   * Inyecta dependencias de tickets, usuarios, LDAP, catálogo y listener de correo.
   * @param tickets - Servicio de creación de tickets.
   * @param users - Servicio de usuarios GLPI.
   * @param ldap - Proveedor de búsqueda LDAP.
   * @param catalog - Servicio de categorías ITIL.
   * @param mailListener - Listener para despachar correos de ticket creado.
   */
  constructor(
    private readonly tickets: TicketsService,
    private readonly users: UsersService,
    private readonly ldap: LdapProvider,
    private readonly catalog: CatalogService,
    private readonly mailListener: MailListener,
  ) {}

  /**
   * Crea un ticket desde un payload de correo y envía notificaciones de forma síncrona.
   * @param dto - Email, descripción, categoría y tipo opcional del ticket.
   * @returns void
   * @throws {BusinessException} Si el solicitante o categoría no son válidos, o falla el envío SMTP.
   */
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

  /**
   * Resuelve el solicitante por email en GLPI o, en su defecto, en LDAP.
   * @param email - Correo del solicitante.
   * @returns Datos normalizados del usuario con fuente y ubicación.
   * @throws {BusinessException} Si no existe usuario para el email indicado.
   */
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

  /**
   * Valida que la categoría ITIL exista en el catálogo.
   * @param categoryId - ID de categoría solicitada.
   * @returns ID y nombre legible de la categoría.
   * @throws {BusinessException} Si la categoría no es válida.
   */
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
