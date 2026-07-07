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

  it("filtra proyectos activos por integrante y excluye estados finalizados o cancelados", async () => {
    mysql.query
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await repository.listAllProjects(
      { page: 1, limit: 15, lifecycle: "active", assignedMemberId: 25 },
      { userId: 25, role: "technician" },
    );

    const countSql = String(mysql.query.mock.calls[0][0]);
    const params = mysql.query.mock.calls[0][1];
    expect(countSql).toContain("COALESCE(ps.is_finished, 0) = 0");
    expect(countSql).toContain("NOT REGEXP 'finaliz|cancel'");
    expect(countSql).toContain("glpi_projectteams team_scope");
    expect(params).toMatchObject({ assignedMemberId: 25 });
  });

  it("filtra proyectos ERS sin aprobar", async () => {
    mysql.query
      .mockResolvedValueOnce([{ total: 0 }])
      .mockResolvedValueOnce([]);

    await repository.listAllProjects(
      { page: 1, limit: 15, lifecycle: "active", approved: "unapproved" },
      { userId: 25, role: "technician" },
    );

    const countSql = String(mysql.query.mock.calls[0][0]);
    expect(countSql).toContain("COALESCE(ps.is_finished, 0) = 0");
    expect(countSql).toContain("NOT EXISTS");
    expect(countSql).toContain("LIKE '%[aprobado]si%'");
  });

  it("mapea indicadores por sistema y por todos los grupos del solicitante", async () => {
    mysql.query
      .mockResolvedValueOnce([
        {
          group_active: 4,
          group_active_month: 2,
          group_total_month: 4,
          site_active: 1,
          site_active_month: 1,
          site_total_month: 2,
          mine_active: 3,
          mine_active_month: 1,
          mine_total_month: 2,
          unapproved_active: 2,
          unapproved_active_month: 1,
          unapproved_total_month: 2,
        },
      ])
      .mockResolvedValueOnce([
        { location_id: 3, location_name: "Casa Central", active_count: 2 },
      ])
      .mockResolvedValueOnce([
        { project_type_id: 4, project_type_name: "SAP", active_count: 3 },
        { project_type_id: null, project_type_name: null, active_count: 1 },
      ])
      .mockResolvedValueOnce([
        { area_name: "Administracion", active_count: 2 },
        { area_name: "Finanzas", active_count: 2 },
        { area_name: null, active_count: 1 },
      ]);

    await expect(repository.getMetrics(25, 3)).resolves.toMatchObject({
      activeBySystem: [
        { projectTypeId: 4, name: "SAP", active: 3 },
        { projectTypeId: null, name: "Sin sistema", active: 1 },
      ],
      activeByArea: [
        { name: "Administracion", active: 2 },
        { name: "Finanzas", active: 2 },
        { name: "Sin área/grupo", active: 1 },
      ],
      unapproved: {
        active: 2,
        activeThisMonth: 1,
        totalThisMonth: 2,
        activePercent: 50,
      },
    });

    const areaSql = String(mysql.query.mock.calls[3][0]);
    expect(areaSql).toContain("glpi_groups_users gu");
    expect(areaSql).toContain("GROUP BY area_name");
    expect(areaSql).not.toContain("SELECT MIN(gu");
  });
});
