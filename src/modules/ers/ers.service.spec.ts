import type { ErsDetail } from "./ers.types";
import { ErsService } from "./ers.service";

describe("ErsService history", () => {
  const repository = {
    findByProjectId: jest.fn(),
    saveTiEdition: jest.fn(),
    findTicketEscalationContext: jest.fn(),
    projectTypeExists: jest.fn(),
    escalateTicketToProject: jest.fn(),
  };
  const technicians = { listEligibleTechniciansForLocation: jest.fn() };
  const catalog = { listGroups: jest.fn() };
  const history = { registerEvent: jest.fn() };
  const config = { get: jest.fn(() => ["Mejora"]) };
  const service = new ErsService(
    repository as never,
    technicians as never,
    {} as never,
    catalog as never,
    history as never,
    config as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it("registra la prioridad TI y los campos enriquecidos en el snapshot", async () => {
    const previous = detail({ priority: 3 });
    const current = detail({ priority: 4 });
    repository.findByProjectId.mockResolvedValueOnce(previous).mockResolvedValueOnce(current);
    repository.saveTiEdition.mockResolvedValue(true);

    await service.saveTiEdition(
      { id: 25, role: "technician", locationId: 1 },
      42,
      {
        approved: true,
        requestType: "Mejora",
        priority: 4,
        teamMemberIds: [],
        tasks: [],
      },
    );

    expect(history.registerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 42,
        actionType: "update",
        summary: "Se actualizó: prioridad TI.",
        beforeState: expect.objectContaining({
          priority: 3,
          requesterSectors: ["Finanzas"],
          ticketCreatedAt: "2026-07-01T08:00:00.000Z",
        }),
        afterState: expect.objectContaining({ priority: 4 }),
      }),
    );
  });

  describe("escalate", () => {
    const context = {
      ticketId: 99,
      ticketName: "Solicitud",
      entityId: 1,
      requesterId: 7,
      locationId: 3,
      status: 2,
    };
    const input = {
      ticketId: 99,
      approved: true,
      projectName: "Portal",
      objective: "Reducir tiempos",
      description: "Detalle funcional",
      requestType: "Mejora",
      priority: 4,
      approverId: 25,
      projectStateId: 2,
      projectTypeId: 4,
      impact: "Impacto",
      teamMemberIds: [25, 30],
      tasks: [{
        name: "Diseño",
        content: "Definir alcance",
        percentDone: 0,
        projectStateId: 2,
        userId: 30,
        planStartDate: "2026-07-06T00:00:00.000Z",
        planEndDate: "2026-07-10T00:00:00.000Z",
      }],
    };

    beforeEach(() => {
      repository.findTicketEscalationContext.mockResolvedValue(context);
      repository.projectTypeExists.mockResolvedValue(true);
      repository.escalateTicketToProject.mockResolvedValue(42);
      repository.findByProjectId.mockResolvedValue(detail());
      catalog.listGroups.mockResolvedValue([{ id: 10, name: "TI" }]);
      technicians.listEligibleTechniciansForLocation.mockResolvedValue([
        { id: 25 },
        { id: 30 },
      ]);
    });

    it("persiste el editor completo al escalar", async () => {
      await expect(service.escalate(
        { id: 25, role: "technician", locationId: 3 },
        structuredClone(input),
      )).resolves.toMatchObject({ projectId: 42 });

      expect(repository.escalateTicketToProject).toHaveBeenCalledWith(
        expect.objectContaining({
          requestType: "Mejora",
          priority: 4,
          approved: true,
          teamMemberIds: [25, 30],
          tasks: [expect.objectContaining({ name: "Diseño", userId: 30 })],
        }),
        25,
        context,
      );
    });

    it("rechaza tareas cuando el proyecto no está aprobado", async () => {
      await expect(service.escalate(
        { id: 25, role: "technician", locationId: 3 },
        { ...structuredClone(input), approved: false },
      )).rejects.toMatchObject({ message: "El proyecto debe estar aprobado para crear tareas" });
    });

    it("rechaza usuarios sin acceso TI", async () => {
      await expect(service.escalate(
        { id: 7, role: "final_user", locationId: 3 },
        structuredClone(input),
      )).rejects.toMatchObject({ message: "Solo usuarios TI pueden escalar tickets a ERS" });
      expect(repository.escalateTicketToProject).not.toHaveBeenCalled();
    });

    it("rechaza tipos de requerimiento no configurados", async () => {
      await expect(service.escalate(
        { id: 25, role: "technician", locationId: 3 },
        { ...structuredClone(input), requestType: "Otro" },
      )).rejects.toMatchObject({ message: "El tipo de requerimiento seleccionado no es válido" });
    });

    it("rechaza técnicos que no están activos", async () => {
      technicians.listEligibleTechniciansForLocation.mockResolvedValue([{ id: 25 }]);
      await expect(service.escalate(
        { id: 25, role: "technician", locationId: 3 },
        structuredClone(input),
      )).rejects.toMatchObject({ message: "Algunos usuarios seleccionados no son técnicos válidos para la sede" });
    });

    it("mantiene el conflicto si el ticket deja de ser elegible dentro de la transacción", async () => {
      repository.escalateTicketToProject.mockRejectedValue(new Error("ticket_not_eligible"));
      await expect(service.escalate(
        { id: 25, role: "technician", locationId: 3 },
        structuredClone(input),
      )).rejects.toMatchObject({ message: "El ticket ya no está disponible para escalar" });
    });

    it("mantiene el conflicto si el ticket ya fue escalado", async () => {
      repository.escalateTicketToProject.mockRejectedValue(new Error("ticket_already_scaled"));
      await expect(service.escalate(
        { id: 25, role: "technician", locationId: 3 },
        structuredClone(input),
      )).rejects.toMatchObject({ message: "El ticket ya está vinculado a un proyecto ERS" });
    });
  });
});

function detail(overrides: Partial<ErsDetail> = {}): ErsDetail {
  return {
    projectId: 42,
    projectName: "Portal",
    ticketId: 99,
    requesterId: 7,
    requesterName: "Ana Pérez",
    requesterSectors: ["Finanzas"],
    locationId: 1,
    locationName: "Casa Central",
    objective: "Objetivo",
    description: "Descripción",
    impact: null,
    requestType: "Mejora",
    priority: 3,
    approved: true,
    approverId: null,
    approverName: null,
    projectStateId: 2,
    projectStateName: "En curso",
    projectTypeId: 4,
    projectTypeName: "SAP",
    progress: 0,
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-02T09:00:00.000Z",
    ticketCreatedAt: "2026-07-01T08:00:00.000Z",
    ticketStatus: 2,
    ticketSolvedAt: null,
    ticketClosedAt: null,
    team: [],
    tasks: [],
    ...overrides,
  };
}
