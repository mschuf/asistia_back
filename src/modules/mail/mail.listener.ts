import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { MailService } from "./mail.service";
import {
  MAIL_EVENTS,
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

export interface TicketCreatedMailDispatchResult {
  sent: boolean;
  error: string | null;
  userMailSent: boolean;
  supportMailSent: boolean;
}

@Injectable()
export class MailListener {
  private readonly logger = new Logger(MailListener.name);

  constructor(private readonly mail: MailService) {}

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

  @OnEvent(MAIL_EVENTS.TICKET_CREATED, { async: true, promisify: true })
  async onTicketCreated(event: TicketCreatedEvent): Promise<void> {
    await this.dispatchTicketCreated(event);
  }

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

  @OnEvent(MAIL_EVENTS.TICKET_ASSIGNED, { async: true, promisify: true })
  async onTicketAssigned(event: TicketAssignedEvent): Promise<void> {
    const result = await this.mail.send({
      subject: buildTicketAssignedSubject(event),
      html: buildTicketAssignedHtml(event),
      text: buildTicketAssignedText(event),
      recipients: event.recipients,
    });
    if (!result.sent && result.error) {
      this.logger.error(`Ticket ${event.ticketId} assigned mail failed: ${result.error}`);
    }
  }

  @OnEvent(MAIL_EVENTS.TICKET_REASSIGNED, { async: true, promisify: true })
  async onTicketReassigned(event: TicketReassignedEvent): Promise<void> {
    const result = await this.mail.send({
      subject: buildTicketReassignedSubject(event),
      html: buildTicketReassignedHtml(event),
      text: buildTicketReassignedText(event),
      recipients: event.recipients,
    });
    if (!result.sent && result.error) {
      this.logger.error(`Ticket ${event.ticketId} reassigned mail failed: ${result.error}`);
    }
  }
}
