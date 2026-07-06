import type { ErsDetail } from "./ers.types";
import { ErsService } from "./ers.service";

describe("ErsService history", () => {
  const repository = {
    findByProjectId: jest.fn(),
    saveTiEdition: jest.fn(),
  };
  const history = { registerEvent: jest.fn() };
  const config = { get: jest.fn(() => ["Mejora"]) };
  const service = new ErsService(
    repository as never,
    {} as never,
    {} as never,
    {} as never,
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
