/**
 * @file ticket-reassigned.template.spec.ts
 * @description Pruebas unitarias para plantillas de reasignación por rol.
 */
import {
  buildTicketReassignedHtml,
  buildTicketReassignedSubject,
  buildTicketReassignedText,
} from "./ticket-reassigned.template";

describe("ticket-reassigned.template", () => {
  const input = {
    ticketId: 456,
    subject: "VPN sin conexión",
    previousTechnicianName: "Pedro TI",
    newTechnicianName: "Lucia TI",
    reassignedBy: "Mario Jefe",
  };

  it("builds requester subject and body", () => {
    expect(buildTicketReassignedSubject(input, "requester")).toBe(
      "Su ticket #456 fue reasignado a Lucia TI",
    );
    expect(buildTicketReassignedHtml(input, "requester")).toContain(
      "Su ticket fue reasignado.",
    );
    expect(buildTicketReassignedText(input, "requester")).toContain(
      "Su ticket #456 fue reasignado.",
    );
  });

  it("builds previous technician subject and body", () => {
    expect(buildTicketReassignedSubject(input, "previous_technician")).toBe(
      "Ticket #456 reasignado a Lucia TI",
    );
    expect(buildTicketReassignedHtml(input, "previous_technician")).toContain(
      "ya no figura bajo su responsabilidad",
    );
    expect(buildTicketReassignedText(input, "previous_technician")).toContain(
      "ya no figura bajo su responsabilidad",
    );
  });

  it("builds new technician subject and body", () => {
    expect(buildTicketReassignedSubject(input, "new_technician")).toBe(
      "Ticket #456 reasignado a usted",
    );
    expect(buildTicketReassignedHtml(input, "new_technician")).toContain(
      "Se le reasignó un ticket para su atención.",
    );
    expect(buildTicketReassignedText(input, "new_technician")).toContain(
      "Se le reasignó el ticket #456.",
    );
  });
});
