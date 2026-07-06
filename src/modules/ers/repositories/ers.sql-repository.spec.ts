import { ErsSqlRepository } from "./ers.sql-repository";

describe("ErsSqlRepository.findByProjectId", () => {
  const mysql = { query: jest.fn() };
  const repository = new ErsSqlRepository(mysql as never, {} as never);

  beforeEach(() => jest.clearAllMocks());

  it("mapea sectores, fechas y estado del ticket para el snapshot ERS", async () => {
    mysql.query
      .mockResolvedValueOnce([
        {
          project_id: 42,
          project_name: "Portal",
          ticket_id: 99,
          requester_id: 7,
          requester_name: "Ana Pérez",
          location_id: 3,
          location_name: "Casa Central",
          objective: "Objetivo",
          description: "Descripción",
          impact: null,
          request_type: null,
          priority: 5,
          approved: null,
          approver_id: null,
          approver_name: null,
          project_state_id: 2,
          project_state_name: "En curso",
          project_type_id: 4,
          project_type_name: "SAP",
          progress: 60,
          created_at: "2026-07-01T08:00:00.000Z",
          updated_at: "2026-07-02T08:00:00.000Z",
          ticket_created_at: "2026-06-30T10:00:00.000Z",
          ticket_status: 6,
          ticket_solved_at: "2026-07-01T09:00:00.000Z",
          ticket_closed_at: "2026-07-01T10:00:00.000Z",
        },
      ])
      .mockResolvedValueOnce([
        { sector_name: "Administración" },
        { sector_name: "Finanzas" },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(repository.findByProjectId(42)).resolves.toMatchObject({
      projectId: 42,
      requesterSectors: ["Administración", "Finanzas"],
      priority: 5,
      createdAt: "2026-07-01T08:00:00.000Z",
      ticketCreatedAt: "2026-06-30T10:00:00.000Z",
      ticketStatus: 6,
      ticketSolvedAt: "2026-07-01T09:00:00.000Z",
      ticketClosedAt: "2026-07-01T10:00:00.000Z",
    });

    expect(mysql.query.mock.calls[1][1]).toEqual({ requesterId: 7 });
    expect(mysql.query.mock.calls[1][0]).toContain("ORDER BY sector_name ASC");
  });
});
