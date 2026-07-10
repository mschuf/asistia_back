/**
 * @file mail.listener.ts
 * @description Escucha eventos de dominio de tickets y despacha correos con las plantillas correspondientes.
 */
import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { MailService } from "./mail.service";
import {
  MAIL_EVENTS,
  type ErsClosedEvent,
  type ErsCreatedEvent,
  type ErsEscalatedEvent,
  type ErsTeamAssignedEvent,
  type TicketAssignedEvent,
  type TicketCreatedEvent,
  type TicketReassignedEvent,
  type TicketStatusChangedEvent,
} from "./mail.events";
import {
  buildTicketCreatedHtml,
  buildTicketCreatedSubject,
  buildTicketCreatedText,
} from "./templates/ticket-created.template";
import {
  buildTicketStatusChangedHtml,
  buildTicketStatusChangedSubject,
  buildTicketStatusChangedText,
} from "./templates/ticket-status-changed.template";
import {
  buildTicketAssignedHtml,
  buildTicketAssignedSubject,
  buildTicketAssignedText,
} from "./templates/ticket-assigned.template";
import {
  buildTicketReassignedHtml,
  buildTicketReassignedSubject,
  buildTicketReassignedText,
} from "./templates/ticket-reassigned.template";
import {
  buildErsEscalatedHtml,
  buildErsEscalatedSubject,
  buildErsEscalatedText,
} from "./templates/ers-escalated.template";
import {
  buildErsCreatedHtml,
  buildErsCreatedSubject,
  buildErsCreatedText,
} from "./templates/ers-created.template";
import {
  buildErsTeamAssignedHtml,
  buildErsTeamAssignedSubject,
  buildErsTeamAssignedText,
} from "./templates/ers-team-assigned.template";
import {
  buildErsClosedHtml,
  buildErsClosedSubject,
  buildErsClosedText,
} from "./templates/ers-closed.template";

/** Resultado detallado del envío de correos al crear un ticket. */
export interface TicketCreatedMailDispatchResult {
  sent: boolean;
  error: string | null;
  userMailSent: boolean;
  supportMailSent: boolean;
}

/**
 * Listener de eventos de correo relacionados con el ciclo de vida de tickets.
 */
@Injectable()
export class MailListener {
  private readonly logger = new Logger(MailListener.name);

  /**
   * Inyecta el servicio de envío SMTP.
   * @param mail - Servicio de correo.
   */
  constructor(private readonly mail: MailService) {}

  /**
   * Envía correos personalizados a cada destinatario del evento de ticket creado.
   * @param event - Datos del ticket y lista de destinatarios con rol.
   * @returns Estado agregado del envío por rol solicitante/técnico.
   */
  async dispatchTicketCreated(
    event: TicketCreatedEvent,
  ): Promise<TicketCreatedMailDispatchResult> {
    if (event.notify.length === 0) {
      return {
        sent: false,
        error: "no_recipients",
        userMailSent: false,
        supportMailSent: false,
      };
    }

    let userMailSent = false;
    let supportMailSent = false;
    let lastError: string | null = null;
    let allSent = true;

    for (const recipient of event.notify) {
      const result = await this.mail.send({
        subject: buildTicketCreatedSubject(event, recipient.role),
        html: buildTicketCreatedHtml(event, recipient.role),
        text: buildTicketCreatedText(event, recipient.role),
        recipients: [recipient],
      });

      if (recipient.role === "requester") {
        userMailSent = result.sent;
      } else if (recipient.role === "technician") {
        supportMailSent = result.sent;
      }

      if (!result.sent) {
        allSent = false;
        lastError = result.error ?? "mail_send_failed";
        this.logger.error(
          `Ticket ${event.ticketId} created mail failed for ${recipient.role}: ${lastError}`,
        );
      }
    }

    return {
      sent: allSent,
      error: allSent ? null : lastError,
      userMailSent,
      supportMailSent,
    };
  }

  /**
   * Maneja el evento asíncrono de ticket creado y despacha los correos correspondientes.
   * @param event - Payload del evento `mail.ticket.created`.
   * @returns Promesa resuelta tras intentar el envío.
   */
  @OnEvent(MAIL_EVENTS.TICKET_CREATED, { async: true, promisify: true })
  async onTicketCreated(event: TicketCreatedEvent): Promise<void> {
    await this.dispatchTicketCreated(event);
  }

  /**
   * Maneja el evento de cambio de estado y notifica a los destinatarios.
   * @param event - Payload con estados anterior y nuevo.
   * @returns Promesa resuelta tras intentar el envío.
   */
  @OnEvent(MAIL_EVENTS.TICKET_STATUS_CHANGED, { async: true, promisify: true })
  async onTicketStatusChanged(event: TicketStatusChangedEvent): Promise<void> {
    const result = await this.mail.send({
      subject: buildTicketStatusChangedSubject(event),
      html: buildTicketStatusChangedHtml(event),
      text: buildTicketStatusChangedText(event),
      recipients: event.recipients,
    });
    if (!result.sent && result.error) {
      this.logger.error(`Ticket ${event.ticketId} status mail failed: ${result.error}`);
    }
  }

  /**
   * Maneja el evento de asignación de ticket al técnico.
   * @param event - Payload con técnico asignado y destinatarios.
   * @returns Promesa resuelta tras intentar el envío.
   */
  @OnEvent(MAIL_EVENTS.TICKET_ASSIGNED, { async: true, promisify: true })
  async onTicketAssigned(event: TicketAssignedEvent): Promise<void> {
    await this.dispatchTicketAssigned(event);
  }

  /**
   * Maneja el evento de reasignación de ticket a otro técnico.
   * @param event - Payload con técnico anterior, nuevo y destinatarios.
   * @returns Promesa resuelta tras intentar el envío.
   */
  @OnEvent(MAIL_EVENTS.TICKET_REASSIGNED, { async: true, promisify: true })
  async onTicketReassigned(event: TicketReassignedEvent): Promise<void> {
    await this.dispatchTicketReassigned(event);
  }

  /**
   * Envía correos de asignación inicial personalizados por rol.
   * @param event - Payload con destinatarios y datos del ticket.
   * @returns void
   */
  async dispatchTicketAssigned(event: TicketAssignedEvent): Promise<void> {
    for (const recipient of event.notify) {
      const result = await this.mail.send({
        subject: buildTicketAssignedSubject(event, recipient.role),
        html: buildTicketAssignedHtml(event, recipient.role),
        text: buildTicketAssignedText(event, recipient.role),
        recipients: [recipient],
      });
      if (!result.sent && result.error) {
        this.logger.error(
          `Ticket ${event.ticketId} assigned mail failed for ${recipient.role}: ${result.error}`,
        );
      }
    }
  }

  /**
   * Envía correos de reasignación personalizados por rol.
   * @param event - Payload con destinatarios y datos del ticket.
   * @returns void
   */
  async dispatchTicketReassigned(event: TicketReassignedEvent): Promise<void> {
    for (const recipient of event.notify) {
      const result = await this.mail.send({
        subject: buildTicketReassignedSubject(event, recipient.role),
        html: buildTicketReassignedHtml(event, recipient.role),
        text: buildTicketReassignedText(event, recipient.role),
        recipients: [recipient],
      });
      if (!result.sent && result.error) {
        this.logger.error(
          `Ticket ${event.ticketId} reassigned mail failed for ${recipient.role}: ${result.error}`,
        );
      }
    }
  }

  /**
   * Maneja el evento de ticket escalado a ERS y notifica al solicitante.
   * @param event - Payload con datos del proyecto ERS y destinatario.
   * @returns Promesa resuelta tras intentar el envío.
   */
  @OnEvent(MAIL_EVENTS.ERS_ESCALATED, { async: true, promisify: true })
  async onErsEscalated(event: ErsEscalatedEvent): Promise<void> {
    for (const recipient of event.notify) {
      const result = await this.mail.send({
        subject: buildErsEscalatedSubject(event),
        html: buildErsEscalatedHtml(event),
        text: buildErsEscalatedText(event),
        recipients: [recipient],
      });
      if (!result.sent && result.error) {
        this.logger.error(`ERS ${event.projectId} escalated mail failed: ${result.error}`);
      }
    }
  }

  /**
   * Maneja el evento de ERS creado y notifica al revisor.
   * @param event - Payload con datos del proyecto ERS y destinatario.
   * @returns Promesa resuelta tras intentar el envío.
   */
  @OnEvent(MAIL_EVENTS.ERS_CREATED, { async: true, promisify: true })
  async onErsCreated(event: ErsCreatedEvent): Promise<void> {
    for (const recipient of event.notify) {
      const result = await this.mail.send({
        subject: buildErsCreatedSubject(event),
        html: buildErsCreatedHtml(event),
        text: buildErsCreatedText(event),
        recipients: [recipient],
      });
      if (!result.sent && result.error) {
        this.logger.error(`ERS ${event.projectId} created mail failed: ${result.error}`);
      }
    }
  }

  /**
   * Maneja el evento de asignación al equipo de un ERS.
   * @param event - Payload con datos del proyecto ERS y destinatarios.
   * @returns Promesa resuelta tras intentar el envío.
   */
  @OnEvent(MAIL_EVENTS.ERS_TEAM_ASSIGNED, { async: true, promisify: true })
  async onErsTeamAssigned(event: ErsTeamAssignedEvent): Promise<void> {
    for (const recipient of event.notify) {
      const result = await this.mail.send({
        subject: buildErsTeamAssignedSubject(event),
        html: buildErsTeamAssignedHtml(event),
        text: buildErsTeamAssignedText(event),
        recipients: [recipient],
      });
      if (!result.sent && result.error) {
        this.logger.error(`ERS ${event.projectId} team assigned mail failed: ${result.error}`);
      }
    }
  }

  /**
   * Maneja el evento de cierre de ERS y notifica a los implicados.
   * @param event - Payload con datos del proyecto ERS y destinatarios.
   * @returns Promesa resuelta tras intentar el envío.
   */
  @OnEvent(MAIL_EVENTS.ERS_CLOSED, { async: true, promisify: true })
  async onErsClosed(event: ErsClosedEvent): Promise<void> {
    for (const recipient of event.notify) {
      const result = await this.mail.send({
        subject: buildErsClosedSubject(event),
        html: buildErsClosedHtml(event),
        text: buildErsClosedText(event),
        recipients: [recipient],
      });
      if (!result.sent && result.error) {
        this.logger.error(`ERS ${event.projectId} closed mail failed: ${result.error}`);
      }
    }
  }
}
