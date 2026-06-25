/**
 * @file ticket-assigned.template.spec.ts
 * @description Pruebas unitarias para plantillas de asignación inicial por rol.
 */
import {
  buildTicketAssignedHtml,
  buildTicketAssignedSubject,
  buildTicketAssignedText,
} from "./ticket-assigned.template";

describe("ticket-assigned.template", () => {
  const input = {
    ticketId: 123,
    subject: "No funciona impresora",
    technicianName: "Ana TI",
    assignedBy: "Carlos Supervisor",
  };

  it("builds requester subject and body", () => {
    expect(buildTicketAssignedSubject(input, "requester")).toBe(
      "Su ticket #123 fue asignado a Ana TI",
    );
    expect(buildTicketAssignedHtml(input, "requester")).toContain(
      "Su ticket fue asignado a <strong>Ana TI</strong>.",
    );
    expect(buildTicketAssignedText(input, "requester")).toContain(
      "Su ticket #123 fue asignado a Ana TI.",
    );
  });

  it("builds new technician subject and body", () => {
    expect(buildTicketAssignedSubject(input, "new_technician")).toBe(
      "Ticket #123 asignado a Ana TI",
    );
    expect(buildTicketAssignedHtml(input, "new_technician")).toContain(
      "Se le asignó el ticket <strong>#123</strong>.",
    );
    expect(buildTicketAssignedText(input, "new_technician")).toContain(
      "Se le asignó el ticket #123.",
    );
  });
});
