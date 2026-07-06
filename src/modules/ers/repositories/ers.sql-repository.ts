/**
 * @file ers.sql-repository.ts
 * @description Repositorio SQL del módulo ERS (ticket -> proyecto GLPI).
 */
import { Injectable } from "@nestjs/common";
import type { QueryOptions, QueryValues, RowDataPacket } from "mysql2";
import type { PoolConnection, ResultSetHeader } from "mysql2/promise";
import { MysqlService } from "../../mysql/mysql.service";
import {
  GLPI_TICKET_STATUS,
  GLPI_TICKET_URGENCY,
} from "../../glpi/glpi.constants";
import { TicketsCreateSqlRepository } from "../../glpi/repositories/tickets-create.sql-repository";
import { appendResolutionNote } from "../../tickets/domain/ticket-resolution.helpers";
import type { CreateErsDto } from "../dto/create-ers.dto";
import type { EscalarTicketDto } from "../dto/escalar-ticket.dto";
import type { ListErsQueryDto } from "../dto/list-ers-query.dto";
import type { ErsTaskInputDto, UpdateErsDto } from "../dto/update-ers.dto";
import type {
  ErsAccessScope,
  ErsDetail,
  ErsEligibleTicket,
  ErsListItem,
  ErsMetricSlice,
  ErsMetrics,
  ErsProjectState,
  ErsProjectType,
  ErsTask,
  ErsTeamMember,
  TicketEscalationContext,
} from "../ers.types";

interface TicketContextRow extends RowDataPacket {
  ticket_id: number;
  ticket_name: string;
  entities_id: number;
  requester_id: number | null;
  locations_id: number | null;
  status: number;
}

interface ProjectStateRow extends RowDataPacket {
  id: number;
  name: string;
  color: string | null;
  is_finished: number;
}

interface ProjectTypeRow extends RowDataPacket {
  id: number;
  name: string;
}

interface ErsListRow extends RowDataPacket {
  project_id: number;
  project_name: string;
  ticket_id: number | null;
  requester_id: number | null;
  requester_name: string | null;
  location_id: number | null;
  location_name: string | null;
  approver_id: number | null;
  approver_name: string | null;
  project_state_id: number | null;
  project_state_name: string | null;
  progress: number | null;
  created_at: string | null;
  updated_at: string | null;
}

interface ErsMainDetailRow extends RowDataPacket {
  project_id: number;
  project_name: string;
  ticket_id: number | null;
  requester_id: number | null;
  requester_name: string | null;
  location_id: number | null;
  location_name: string | null;
  objective: string | null;
  description: string | null;
  impact: string | null;
  request_type: string | null;
  priority: number | null;
  approved: string | null;
  approver_id: number | null;
  approver_name: string | null;
  project_state_id: number | null;
  project_state_name: string | null;
  project_type_id: number | null;
  project_type_name: string | null;
  progress: number | null;
  created_at: string | null;
  updated_at: string | null;
  ticket_created_at: string | null;
  ticket_status: number | null;
  ticket_solved_at: string | null;
  ticket_closed_at: string | null;
}

interface ErsRequesterSectorRow extends RowDataPacket {
  sector_name: string;
}

interface ErsTeamRow extends RowDataPacket {
  user_id: number;
  full_name: string;
}

interface ErsTaskRow extends RowDataPacket {
  id: number;
  name: string;
  content: string | null;
  percent_done: number | null;
  project_state_id: number | null;
  project_state_name: string | null;
  user_id: number | null;
  user_name: string | null;
  plan_start_date: string | null;
  plan_end_date: string | null;
}

interface ProjectIdRow extends RowDataPacket {
  id: number;
}

interface TicketEligibilityRow extends RowDataPacket {
  id: number;
}

interface ImpactNoteRow extends RowDataPacket {
  id: number;
}

interface TicketContentRow extends RowDataPacket {
  content: string | null;
}

interface ErsMetricsRow extends RowDataPacket {
  group_active: number | null;
  group_active_month: number | null;
  group_total_month: number | null;
  site_active: number | null;
  site_active_month: number | null;
  site_total_month: number | null;
  mine_active: number | null;
  mine_active_month: number | null;
  mine_total_month: number | null;
}

interface ErsLocationMetricRow extends RowDataPacket {
  location_id: number | null;
  location_name: string | null;
  active_count: number;
}

interface EligibleTicketRow extends RowDataPacket {
  ticket_id: number;
  subject: string;
  requester_name: string | null;
  location_id: number | null;
  location_name: string | null;
}

const ERS_ESCALATION_CLOSURE_NOTE = "Cerrado y escalado a Proyecto ERS.";

const ERS_SORT_SQL: Record<string, string> = {
  projectId: "p.id",
  projectName: "p.name",
  ticketId: "ip.items_id",
  requesterName: "requester_name",
  locationName: "location_name",
  stateName: "project_state_name",
  progress: "progress",
  updatedAt: "p.date_mod",
};

/** Repositorio SQL del módulo ERS. */
@Injectable()
export class ErsSqlRepository {
  constructor(
    private readonly mysql: MysqlService,
    private readonly ticketsCreateSqlRepository: TicketsCreateSqlRepository,
  ) {}

  /** Crea ticket, proyecto y todos sus datos en una única transacción MySQL. */
  async createStandaloneProject(
    input: CreateErsDto,
    context: {
      actorId: number;
      entityId: number;
      ticketType: number;
    },
  ): Promise<{ ticketId: number; projectId: number }> {
    return this.mysql.withTransaction(async (connection) => {
      const ticketId = await this.ticketsCreateSqlRepository.createInTransaction(connection, {
        name: input.projectName.trim(),
        content: input.description.trim(),
        type: context.ticketType,
        status: GLPI_TICKET_STATUS.NEW,
        urgency: GLPI_TICKET_URGENCY.MEDIUM,
        itilcategories_id: 0,
        locations_id: input.locationId,
        entities_id: context.entityId,
        requesters_id: input.requesterId,
      });

      const defaultStateId = await this.resolveDefaultProjectStateId(connection);
      const projectId = await this.insertProject(connection, {
        projectName: input.projectName,
        objective: input.objective,
        description: input.description,
        entityId: context.entityId,
        projectStateId: this.toPositiveOrNull(input.projectStateId) ?? defaultStateId,
        projectTypeId: this.toPositiveOrNull(input.projectTypeId),
        approverId: this.toPositiveOrNull(input.approverId),
        priority: input.priority,
      });

      await this.insertTicketProjectLink(connection, ticketId, projectId);
      await this.syncImpactNote(connection, {
        projectId,
        actorId: context.actorId,
        impact: input.impact ?? "",
      });
      await this.syncRequestTypeNote(connection, {
        projectId,
        actorId: context.actorId,
        requestType: input.requestType,
      });
      await this.syncApprovedNote(connection, {
        projectId,
        actorId: context.actorId,
        approved: input.approved,
      });
      await this.replaceProjectTeam(connection, projectId, input.teamMemberIds);
      await this.replaceProjectTasks(connection, projectId, input.tasks);
      await this.appendEscalationClosureNote(connection, ticketId);
      await this.closeTicket(connection, ticketId);

      return { ticketId, projectId };
    });
  }

  /**
   * Recupera datos del ticket necesarios para escalar a proyecto.
   * @param ticketId - Ticket origen.
   * @returns Contexto mínimo o `null` si no existe.
   */
  async findTicketEscalationContext(ticketId: number): Promise<TicketEscalationContext | null> {
    const rows = await this.mysql.query<TicketContextRow>(
      `SELECT
          t.id AS ticket_id,
          t.name AS ticket_name,
          t.entities_id,
          req.users_id AS requester_id,
          t.locations_id,
          t.status
       FROM glpi_tickets t
       LEFT JOIN glpi_tickets_users req
         ON req.tickets_id = t.id
        AND req.type = 1
       WHERE t.id = :ticketId
         AND COALESCE(t.is_deleted, 0) = 0
       ORDER BY req.id ASC
       LIMIT 1`,
      { ticketId } as QueryValues,
    );
    const row = rows[0];
    if (!row) return null;
    return {
      ticketId: Number(row.ticket_id),
      ticketName: String(row.ticket_name ?? "").trim(),
      entityId: Number(row.entities_id ?? 0),
      requesterId: this.toPositiveOrNull(row.requester_id),
      locationId: this.toPositiveOrNull(row.locations_id),
      status: Number(row.status ?? 0),
    };
  }

  /**
   * Verifica si un ticket ya está vinculado a un proyecto.
   * @param ticketId - Ticket origen.
   * @returns `true` si ya existe vínculo.
   */
  async hasProjectLink(ticketId: number): Promise<boolean> {
    const rows = await this.mysql.query<ProjectIdRow>(
      `SELECT projects_id AS id
       FROM glpi_itils_projects
       WHERE itemtype = 'Ticket'
         AND items_id = :ticketId
       LIMIT 1`,
      { ticketId } as QueryValues,
    );
    return rows.length > 0;
  }

  /**
   * Ejecuta la transacción 1 de escalado (creación inicial por final_user o técnico).
   * @param input - Datos funcionales del ERS.
   * @param actorId - Usuario que ejecuta la acción.
   * @param context - Contexto del ticket origen.
   * @returns ID del proyecto creado.
   */
  async escalateTicketToProject(
    input: EscalarTicketDto,
    actorId: number,
    context: TicketEscalationContext,
  ): Promise<number> {
    return this.mysql.withTransaction(async (connection) => {
      const eligible = await this.isTicketEligibleInTx(connection, context.ticketId);
      if (!eligible) {
        throw new Error('ticket_not_eligible');
      }
      const alreadyLinked = await this.hasProjectLinkInTx(connection, context.ticketId);
      if (alreadyLinked) {
        throw new Error("ticket_already_scaled");
      }

      const defaultStateId = await this.resolveDefaultProjectStateId(connection);
      const projectId = await this.insertProject(connection, {
        projectName: input.projectName,
        objective: input.objective,
        description: input.description,
        entityId: context.entityId,
        projectStateId: defaultStateId,
        projectTypeId: this.toPositiveOrNull(input.projectTypeId),
      });

      await this.insertTicketProjectLink(connection, context.ticketId, projectId);

      if ((input.impact ?? "").trim()) {
        await this.insertImpactNote(connection, {
          projectId,
          actorId,
          impact: input.impact ?? "",
        });
      }

      const responsibleIds = this.uniquePositive(input.responsibleIds);
      for (const userId of responsibleIds) {
        await this.insertProjectTeamUser(connection, projectId, userId);
      }

      await this.appendEscalationClosureNote(connection, context.ticketId);
      await this.closeTicket(connection, context.ticketId);
      return projectId;
    });
  }

  /**
   * Lista ERS con paginación server-side y filtro por scope de usuario.
   * @param query - Filtros/sort/paginación.
   * @param scope - Usuario autenticado.
   * @returns Resultado paginado.
   */
  async list(
    query: ListErsQueryDto,
    scope: ErsAccessScope,
  ): Promise<{ items: ErsListItem[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, query.limit ?? 15);
    const offset = (page - 1) * limit;

    const whereParts: string[] = [
      "COALESCE(p.is_deleted, 0) = 0",
      "ip.itemtype = 'Ticket'",
    ];
    const params: Record<string, unknown> = {};

    if (scope.role !== "technician") {
      whereParts.push(
        `EXISTS (
          SELECT 1
          FROM glpi_tickets_users tu_scope
          WHERE tu_scope.tickets_id = ip.items_id
            AND tu_scope.type = 1
            AND tu_scope.users_id = :scopeUserId
        )`,
      );
      params.scopeUserId = scope.userId;
    }

    if ((query.search ?? "").trim()) {
      whereParts.push(
        `(CAST(p.id AS CHAR) LIKE :search
          OR LOWER(COALESCE(p.name, '')) LIKE :search
          OR CAST(ip.items_id AS CHAR) LIKE :search
          OR LOWER(COALESCE(CONCAT(req.firstname, ' ', req.realname), req.name, '')) LIKE :search
          OR LOWER(COALESCE(loc.completename, loc.name, '')) LIKE :search
          OR LOWER(COALESCE(ps.name, '')) LIKE :search
          OR CAST(
            ROUND(
              COALESCE((
                SELECT AVG(COALESCE(pt_search.percent_done, 0))
                FROM glpi_projecttasks pt_search
                WHERE pt_search.projects_id = p.id
              ), 0),
              0
            ) AS CHAR
          ) LIKE :search
          OR LOWER(COALESCE(CONCAT(appr.firstname, ' ', appr.realname), appr.name, '')) LIKE :search
          OR LOWER(COALESCE(DATE_FORMAT(p.date_creation, '%d/%m/%Y'), '')) LIKE :search)`,
      );
      params.search = `%${query.search!.trim().toLowerCase()}%`;
    }

    if ((query.projectName ?? "").trim()) {
      whereParts.push("LOWER(COALESCE(p.name, '')) LIKE :projectName");
      params.projectName = `%${query.projectName!.trim().toLowerCase()}%`;
    }

    if (query.createdFrom) {
      whereParts.push("p.date_creation >= :createdFrom");
      params.createdFrom = query.createdFrom;
    }
    if (query.createdTo) {
      whereParts.push("p.date_creation < DATE_ADD(:createdTo, INTERVAL 1 DAY)");
      params.createdTo = query.createdTo;
    }

    if (query.requesterId) {
      whereParts.push("req.id = :requesterId");
      params.requesterId = query.requesterId;
    }

    if ((query.requesterName ?? "").trim()) {
      whereParts.push("LOWER(COALESCE(CONCAT(req.firstname, ' ', req.realname), req.name, '')) LIKE :requesterName");
      params.requesterName = `%${query.requesterName!.trim().toLowerCase()}%`;
    }

    if ((query.locationName ?? "").trim()) {
      whereParts.push("LOWER(COALESCE(loc.completename, loc.name, '')) LIKE :locationName");
      params.locationName = `%${query.locationName!.trim().toLowerCase()}%`;
    }

    if ((query.approverName ?? "").trim()) {
      whereParts.push("LOWER(COALESCE(CONCAT(appr.firstname, ' ', appr.realname), appr.name, '')) LIKE :approverName");
      params.approverName = `%${query.approverName!.trim().toLowerCase()}%`;
    }

    if (query.projectStateId) {
      whereParts.push("p.projectstates_id = :projectStateId");
      params.projectStateId = query.projectStateId;
    }

    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";
    const sortColumn = ERS_SORT_SQL[query.sortBy ?? "updatedAt"] ?? ERS_SORT_SQL.updatedAt;
    const sortDirection = query.sortOrder === "asc" ? "ASC" : "DESC";

    const countRows = await this.mysql.query<{ total: number } & RowDataPacket>(
      `SELECT COUNT(*) AS total
       FROM glpi_projects p
       INNER JOIN glpi_itils_projects ip
         ON ip.projects_id = p.id
       LEFT JOIN glpi_tickets t
         ON t.id = ip.items_id
       LEFT JOIN glpi_tickets_users req_tu
         ON req_tu.tickets_id = t.id
        AND req_tu.type = 1
       LEFT JOIN glpi_users req
         ON req.id = req_tu.users_id
       LEFT JOIN glpi_locations loc
         ON loc.id = t.locations_id
       LEFT JOIN glpi_users appr
         ON appr.id = p.users_id
       LEFT JOIN glpi_projectstates ps
         ON ps.id = p.projectstates_id
       ${whereSql}`,
      params as QueryValues,
    );
    const total = Number(countRows[0]?.total ?? 0);

    const rows = await this.mysql.query<ErsListRow>(
      `SELECT
          p.id AS project_id,
          p.name AS project_name,
          ip.items_id AS ticket_id,
          req.id AS requester_id,
          COALESCE(NULLIF(CONCAT(COALESCE(req.firstname, ''), ' ', COALESCE(req.realname, '')), ' '), req.name) AS requester_name,
          loc.id AS location_id,
          COALESCE(loc.completename, loc.name) AS location_name,
          appr.id AS approver_id,
          COALESCE(NULLIF(CONCAT(COALESCE(appr.firstname, ''), ' ', COALESCE(appr.realname, '')), ' '), appr.name) AS approver_name,
          ps.id AS project_state_id,
          ps.name AS project_state_name,
          ROUND(COALESCE(AVG(
            CASE
              WHEN pt.id IS NULL THEN NULL
              WHEN LOWER(COALESCE(pts.name, '')) REGEXP 'cancel|rechaz|anulad' THEN NULL
              ELSE COALESCE(pt.percent_done, 0)
            END
          ), 0), 0) AS progress,
          DATE_FORMAT(p.date_creation, '%Y-%m-%dT%H:%i:%s.000Z') AS created_at,
          DATE_FORMAT(p.date_mod, '%Y-%m-%dT%H:%i:%s.000Z') AS updated_at
       FROM glpi_projects p
       INNER JOIN glpi_itils_projects ip
         ON ip.projects_id = p.id
       LEFT JOIN glpi_tickets t
         ON t.id = ip.items_id
       LEFT JOIN glpi_tickets_users req_tu
         ON req_tu.tickets_id = t.id
        AND req_tu.type = 1
       LEFT JOIN glpi_users req
         ON req.id = req_tu.users_id
       LEFT JOIN glpi_locations loc
         ON loc.id = t.locations_id
       LEFT JOIN glpi_users appr
         ON appr.id = p.users_id
       LEFT JOIN glpi_projectstates ps
         ON ps.id = p.projectstates_id
       LEFT JOIN glpi_projecttasks pt
         ON pt.projects_id = p.id
       LEFT JOIN glpi_projectstates pts
         ON pts.id = pt.projectstates_id
       ${whereSql}
       GROUP BY
         p.id, p.name, ip.items_id, req.id, requester_name, loc.id, location_name,
         appr.id, approver_name, ps.id, ps.name, p.date_creation, p.date_mod
       ORDER BY ${sortColumn} ${sortDirection}
       LIMIT :limit OFFSET :offset`,
      {
        ...params,
        limit,
        offset,
      } as QueryValues,
    );

    return {
      items: rows.map((row) => ({
        projectId: Number(row.project_id),
        projectName: String(row.project_name ?? "").trim(),
        ticketId: Number(row.ticket_id),
        requesterId: this.toPositiveOrNull(row.requester_id),
        requesterName: this.toTextOrNull(row.requester_name),
        locationId: this.toPositiveOrNull(row.location_id),
        locationName: this.toTextOrNull(row.location_name),
        approverId: this.toPositiveOrNull(row.approver_id),
        approverName: this.toTextOrNull(row.approver_name),
        projectStateId: this.toPositiveOrNull(row.project_state_id),
        projectStateName: this.toTextOrNull(row.project_state_name),
        progress: this.clampPercent(row.progress),
        createdAt: this.toTextOrNull(row.created_at),
        updatedAt: this.toTextOrNull(row.updated_at),
      })),
      total,
      page,
      limit,
    };
  }

  /**
   * Calcula indicadores ERS sobre todos los proyectos GLPI no eliminados.
   */
  async getMetrics(userId: number, locationId: number | null): Promise<ErsMetrics> {
    const canonicalTicketJoin = `
      LEFT JOIN glpi_itils_projects ip
        ON ip.id = (
          SELECT MIN(ip_first.id)
          FROM glpi_itils_projects ip_first
          WHERE ip_first.projects_id = p.id
            AND ip_first.itemtype = 'Ticket'
        )
      LEFT JOIN glpi_tickets t ON t.id = ip.items_id
      LEFT JOIN glpi_locations loc ON loc.id = t.locations_id
      LEFT JOIN glpi_projectstates ps ON ps.id = p.projectstates_id`;
    const activeSql = 'COALESCE(ps.is_finished, 0) = 0';
    const monthSql = `YEAR(p.date_creation) = YEAR(UTC_TIMESTAMP())
      AND MONTH(p.date_creation) = MONTH(UTC_TIMESTAMP())`;
    const rows = await this.mysql.query<ErsMetricsRow>(
      `SELECT
          SUM(CASE WHEN ${activeSql} THEN 1 ELSE 0 END) AS group_active,
          SUM(CASE WHEN ${activeSql} AND ${monthSql} THEN 1 ELSE 0 END) AS group_active_month,
          SUM(CASE WHEN ${monthSql} THEN 1 ELSE 0 END) AS group_total_month,
          SUM(CASE WHEN ${activeSql} AND loc.id = :locationId THEN 1 ELSE 0 END) AS site_active,
          SUM(CASE WHEN ${activeSql} AND loc.id = :locationId AND ${monthSql} THEN 1 ELSE 0 END) AS site_active_month,
          SUM(CASE WHEN loc.id = :locationId AND ${monthSql} THEN 1 ELSE 0 END) AS site_total_month,
          SUM(CASE WHEN ${activeSql} AND EXISTS (
            SELECT 1 FROM glpi_projectteams mine
            WHERE mine.projects_id = p.id AND mine.itemtype = 'User' AND mine.items_id = :userId
          ) THEN 1 ELSE 0 END) AS mine_active,
          SUM(CASE WHEN ${activeSql} AND ${monthSql} AND EXISTS (
            SELECT 1 FROM glpi_projectteams mine
            WHERE mine.projects_id = p.id AND mine.itemtype = 'User' AND mine.items_id = :userId
          ) THEN 1 ELSE 0 END) AS mine_active_month,
          SUM(CASE WHEN ${monthSql} AND EXISTS (
            SELECT 1 FROM glpi_projectteams mine
            WHERE mine.projects_id = p.id AND mine.itemtype = 'User' AND mine.items_id = :userId
          ) THEN 1 ELSE 0 END) AS mine_total_month
       FROM glpi_projects p
       ${canonicalTicketJoin}
       WHERE COALESCE(p.is_deleted, 0) = 0`,
      { userId, locationId: locationId ?? 0 } as QueryValues,
    );
    const locationRows = await this.mysql.query<ErsLocationMetricRow>(
      `SELECT
          loc.id AS location_id,
          COALESCE(loc.completename, loc.name, 'Sin sede') AS location_name,
          COUNT(*) AS active_count
       FROM glpi_projects p
       ${canonicalTicketJoin}
       WHERE COALESCE(p.is_deleted, 0) = 0
         AND ${activeSql}
       GROUP BY loc.id, location_name
       ORDER BY active_count DESC, location_name ASC`,
    );
    const row = rows[0];
    const slice = (active: unknown, activeMonth: unknown, totalMonth: unknown): ErsMetricSlice => {
      const activeValue = Number(active ?? 0);
      const activeThisMonth = Number(activeMonth ?? 0);
      const totalThisMonth = Number(totalMonth ?? 0);
      return {
        active: activeValue,
        activeThisMonth,
        totalThisMonth,
        activePercent: totalThisMonth > 0 ? Math.round((activeThisMonth / totalThisMonth) * 100) : 0,
      };
    };
    return {
      myGroup: slice(row?.group_active, row?.group_active_month, row?.group_total_month),
      mySite: locationId == null
        ? null
        : slice(row?.site_active, row?.site_active_month, row?.site_total_month),
      myProjects: slice(row?.mine_active, row?.mine_active_month, row?.mine_total_month),
      activeByLocation: locationRows.map((item) => ({
        locationId: this.toPositiveOrNull(item.location_id),
        name: this.toTextOrNull(item.location_name) ?? 'Sin sede',
        active: Number(item.active_count ?? 0),
      })),
    };
  }

  /** Lista tickets activos aún no vinculados a proyectos. */
  async listEligibleTickets(
    search: string | undefined,
    page = 1,
    limit = 15,
  ): Promise<{ items: ErsEligibleTicket[]; total: number; page: number; limit: number }> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, Math.min(limit, 200));
    const offset = (safePage - 1) * safeLimit;
    const params: Record<string, unknown> = {};
    const whereParts = [
      'COALESCE(t.is_deleted, 0) = 0',
      't.status NOT IN (5, 6)',
      `NOT EXISTS (
        SELECT 1 FROM glpi_itils_projects linked
        WHERE linked.itemtype = 'Ticket' AND linked.items_id = t.id
      )`,
    ];
    if ((search ?? '').trim()) {
      whereParts.push(
        `(CAST(t.id AS CHAR) LIKE :search
          OR LOWER(COALESCE(t.name, '')) LIKE :search
          OR LOWER(COALESCE(CONCAT(req.firstname, ' ', req.realname), req.name, '')) LIKE :search
          OR LOWER(COALESCE(loc.completename, loc.name, '')) LIKE :search)`,
      );
      params.search = `%${search!.trim().toLowerCase()}%`;
    }
    const joins = `
      LEFT JOIN glpi_tickets_users req_tu
        ON req_tu.id = (
          SELECT MIN(req_first.id) FROM glpi_tickets_users req_first
          WHERE req_first.tickets_id = t.id AND req_first.type = 1
        )
      LEFT JOIN glpi_users req ON req.id = req_tu.users_id
      LEFT JOIN glpi_locations loc ON loc.id = t.locations_id`;
    const whereSql = `WHERE ${whereParts.join(' AND ')}`;
    const countRows = await this.mysql.query<{ total: number } & RowDataPacket>(
      `SELECT COUNT(*) AS total FROM glpi_tickets t ${joins} ${whereSql}`,
      params as QueryValues,
    );
    const rows = await this.mysql.query<EligibleTicketRow>(
      `SELECT
          t.id AS ticket_id,
          t.name AS subject,
          COALESCE(NULLIF(CONCAT(COALESCE(req.firstname, ''), ' ', COALESCE(req.realname, '')), ' '), req.name) AS requester_name,
          loc.id AS location_id,
          COALESCE(loc.completename, loc.name) AS location_name
       FROM glpi_tickets t
       ${joins}
       ${whereSql}
       ORDER BY t.date_mod DESC, t.id DESC
       LIMIT :limit OFFSET :offset`,
      { ...params, limit: safeLimit, offset } as QueryValues,
    );
    return {
      items: rows.map((item) => ({
        ticketId: Number(item.ticket_id),
        subject: String(item.subject ?? '').trim(),
        requesterName: this.toTextOrNull(item.requester_name),
        locationId: this.toPositiveOrNull(item.location_id),
        locationName: this.toTextOrNull(item.location_name),
      })),
      total: Number(countRows[0]?.total ?? 0),
      page: safePage,
      limit: safeLimit,
    };
  }

  /** Lista todos los proyectos con ticket canónico opcional. */
  async listAllProjects(
    query: ListErsQueryDto,
    scope: ErsAccessScope,
  ): Promise<{ items: ErsListItem[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.max(1, query.limit ?? 15);
    const offset = (page - 1) * limit;
    const whereParts = ['COALESCE(p.is_deleted, 0) = 0'];
    const params: Record<string, unknown> = {};

    if (scope.role !== 'technician') {
      whereParts.push(
        `EXISTS (
          SELECT 1
          FROM glpi_itils_projects ip_scope
          INNER JOIN glpi_tickets_users tu_scope
            ON tu_scope.tickets_id = ip_scope.items_id
           AND tu_scope.type = 1
          WHERE ip_scope.projects_id = p.id
            AND ip_scope.itemtype = 'Ticket'
            AND tu_scope.users_id = :scopeUserId
        )`,
      );
      params.scopeUserId = scope.userId;
    }

    if ((query.search ?? '').trim()) {
      whereParts.push(
        `(CAST(p.id AS CHAR) LIKE :search
          OR LOWER(COALESCE(p.name, '')) LIKE :search
          OR CAST(ip.items_id AS CHAR) LIKE :search
          OR LOWER(COALESCE(CONCAT(req.firstname, ' ', req.realname), req.name, '')) LIKE :search
          OR LOWER(COALESCE(loc.completename, loc.name, '')) LIKE :search
          OR LOWER(COALESCE(ps.name, '')) LIKE :search
          OR LOWER(COALESCE(CONCAT(appr.firstname, ' ', appr.realname), appr.name, '')) LIKE :search
          OR LOWER(COALESCE(DATE_FORMAT(p.date_creation, '%d/%m/%Y'), '')) LIKE :search)`,
      );
      params.search = `%${query.search!.trim().toLowerCase()}%`;
    }
    if ((query.projectName ?? '').trim()) {
      whereParts.push(`LOWER(COALESCE(p.name, '')) LIKE :projectName`);
      params.projectName = `%${query.projectName!.trim().toLowerCase()}%`;
    }
    if (query.createdFrom) {
      whereParts.push('p.date_creation >= :createdFrom');
      params.createdFrom = query.createdFrom;
    }
    if (query.createdTo) {
      whereParts.push('p.date_creation < DATE_ADD(:createdTo, INTERVAL 1 DAY)');
      params.createdTo = query.createdTo;
    }
    if (query.requesterId) {
      whereParts.push('req.id = :requesterId');
      params.requesterId = query.requesterId;
    }
    if ((query.requesterName ?? '').trim()) {
      whereParts.push(`LOWER(COALESCE(CONCAT(req.firstname, ' ', req.realname), req.name, '')) LIKE :requesterName`);
      params.requesterName = `%${query.requesterName!.trim().toLowerCase()}%`;
    }
    if ((query.locationName ?? '').trim()) {
      whereParts.push(`LOWER(COALESCE(loc.completename, loc.name, '')) LIKE :locationName`);
      params.locationName = `%${query.locationName!.trim().toLowerCase()}%`;
    }
    if ((query.approverName ?? '').trim()) {
      whereParts.push(`LOWER(COALESCE(CONCAT(appr.firstname, ' ', appr.realname), appr.name, '')) LIKE :approverName`);
      params.approverName = `%${query.approverName!.trim().toLowerCase()}%`;
    }
    if (query.projectStateId) {
      whereParts.push('p.projectstates_id = :projectStateId');
      params.projectStateId = query.projectStateId;
    }
    if (query.lifecycle === 'active') whereParts.push('COALESCE(ps.is_finished, 0) = 0');
    if (query.lifecycle === 'finished') whereParts.push('COALESCE(ps.is_finished, 0) = 1');
    if (query.locationId) {
      whereParts.push('loc.id = :locationId');
      params.locationId = query.locationId;
    }
    if (query.assignedMemberId) {
      whereParts.push(
        `EXISTS (
          SELECT 1 FROM glpi_projectteams team_scope
          WHERE team_scope.projects_id = p.id
            AND team_scope.itemtype = 'User'
            AND team_scope.items_id = :assignedMemberId
        )`,
      );
      params.assignedMemberId = query.assignedMemberId;
    }

    const canonicalTicketJoin = `
      LEFT JOIN glpi_itils_projects ip
        ON ip.id = (
          SELECT MIN(ip_first.id)
          FROM glpi_itils_projects ip_first
          WHERE ip_first.projects_id = p.id
            AND ip_first.itemtype = 'Ticket'
        )
      LEFT JOIN glpi_tickets t ON t.id = ip.items_id
      LEFT JOIN glpi_tickets_users req_tu
        ON req_tu.id = (
          SELECT MIN(req_first.id)
          FROM glpi_tickets_users req_first
          WHERE req_first.tickets_id = t.id
            AND req_first.type = 1
        )
      LEFT JOIN glpi_users req ON req.id = req_tu.users_id
      LEFT JOIN glpi_locations loc ON loc.id = t.locations_id
      LEFT JOIN glpi_users appr ON appr.id = p.users_id
      LEFT JOIN glpi_projectstates ps ON ps.id = p.projectstates_id`;
    const whereSql = `WHERE ${whereParts.join(' AND ')}`;
    const sortColumn = ERS_SORT_SQL[query.sortBy ?? 'updatedAt'] ?? ERS_SORT_SQL.updatedAt;
    const sortDirection = query.sortOrder === 'asc' ? 'ASC' : 'DESC';

    const countRows = await this.mysql.query<{ total: number } & RowDataPacket>(
      `SELECT COUNT(*) AS total
       FROM glpi_projects p
       ${canonicalTicketJoin}
       ${whereSql}`,
      params as QueryValues,
    );

    const rows = await this.mysql.query<ErsListRow>(
      `SELECT
          p.id AS project_id,
          p.name AS project_name,
          ip.items_id AS ticket_id,
          req.id AS requester_id,
          COALESCE(NULLIF(CONCAT(COALESCE(req.firstname, ''), ' ', COALESCE(req.realname, '')), ' '), req.name) AS requester_name,
          loc.id AS location_id,
          COALESCE(loc.completename, loc.name) AS location_name,
          appr.id AS approver_id,
          COALESCE(NULLIF(CONCAT(COALESCE(appr.firstname, ''), ' ', COALESCE(appr.realname, '')), ' '), appr.name) AS approver_name,
          ps.id AS project_state_id,
          ps.name AS project_state_name,
          ROUND(COALESCE((
            SELECT AVG(COALESCE(pt.percent_done, 0))
            FROM glpi_projecttasks pt
            LEFT JOIN glpi_projectstates pts ON pts.id = pt.projectstates_id
            WHERE pt.projects_id = p.id
              AND (pt.projectstates_id IS NULL OR LOWER(COALESCE(pts.name, '')) NOT REGEXP 'cancel|rechaz|anulad')
          ), 0), 0) AS progress,
          DATE_FORMAT(p.date_creation, '%Y-%m-%dT%H:%i:%s.000Z') AS created_at,
          DATE_FORMAT(p.date_mod, '%Y-%m-%dT%H:%i:%s.000Z') AS updated_at
       FROM glpi_projects p
       ${canonicalTicketJoin}
       ${whereSql}
       ORDER BY ${sortColumn} ${sortDirection}
       LIMIT :limit OFFSET :offset`,
      { ...params, limit, offset } as QueryValues,
    );

    return {
      items: rows.map((row) => ({
        projectId: Number(row.project_id),
        projectName: String(row.project_name ?? '').trim(),
        ticketId: this.toPositiveOrNull(row.ticket_id),
        requesterId: this.toPositiveOrNull(row.requester_id),
        requesterName: this.toTextOrNull(row.requester_name),
        locationId: this.toPositiveOrNull(row.location_id),
        locationName: this.toTextOrNull(row.location_name),
        approverId: this.toPositiveOrNull(row.approver_id),
        approverName: this.toTextOrNull(row.approver_name),
        projectStateId: this.toPositiveOrNull(row.project_state_id),
        projectStateName: this.toTextOrNull(row.project_state_name),
        progress: this.clampPercent(row.progress),
        createdAt: this.toTextOrNull(row.created_at),
        updatedAt: this.toTextOrNull(row.updated_at),
      })),
      total: Number(countRows[0]?.total ?? 0),
      page,
      limit,
    };
  }

  /** Obtiene detalle de un proyecto con ticket canónico opcional. */
  async findByProjectId(projectId: number): Promise<ErsDetail | null> {
    const mainRows = await this.mysql.query<ErsMainDetailRow>(
      `SELECT
          p.id AS project_id,
          p.name AS project_name,
          ip.items_id AS ticket_id,
          req.id AS requester_id,
          COALESCE(NULLIF(CONCAT(COALESCE(req.firstname, ''), ' ', COALESCE(req.realname, '')), ' '), req.name) AS requester_name,
          loc.id AS location_id,
          COALESCE(loc.completename, loc.name) AS location_name,
          p.comment AS objective,
          p.content AS description,
          (
            SELECT n.content
            FROM glpi_notepads n
            WHERE n.itemtype = 'Project'
              AND n.items_id = p.id
              AND LOWER(COALESCE(n.content, '')) LIKE '%[impacto]%'
            ORDER BY n.id DESC
            LIMIT 1
          ) AS impact,
          (
            SELECT n.content
            FROM glpi_notepads n
            WHERE n.itemtype = 'Project'
              AND n.items_id = p.id
              AND LOWER(COALESCE(n.content, '')) LIKE '%[tipo]%'
            ORDER BY n.id DESC
            LIMIT 1
          ) AS request_type,
          p.priority,
          (
            SELECT n.content
            FROM glpi_notepads n
            WHERE n.itemtype = 'Project'
              AND n.items_id = p.id
              AND LOWER(COALESCE(n.content, '')) LIKE '%[aprobado]%'
            ORDER BY n.id DESC
            LIMIT 1
          ) AS approved,
          appr.id AS approver_id,
          COALESCE(NULLIF(CONCAT(COALESCE(appr.firstname, ''), ' ', COALESCE(appr.realname, '')), ' '), appr.name) AS approver_name,
          ps.id AS project_state_id,
          ps.name AS project_state_name,
          project_type.id AS project_type_id,
          project_type.name AS project_type_name,
          ROUND(COALESCE((
            SELECT AVG(COALESCE(tk.percent_done, 0))
            FROM glpi_projecttasks tk
            LEFT JOIN glpi_projectstates ts
              ON ts.id = tk.projectstates_id
            WHERE tk.projects_id = p.id
              AND (
                tk.projectstates_id IS NULL
                OR LOWER(COALESCE(ts.name, '')) NOT REGEXP 'cancel|rechaz|anulad'
              )
          ), 0), 0) AS progress,
          DATE_FORMAT(p.date_creation, '%Y-%m-%dT%H:%i:%s.000Z') AS created_at,
          DATE_FORMAT(p.date_mod, '%Y-%m-%dT%H:%i:%s.000Z') AS updated_at,
          DATE_FORMAT(t.date, '%Y-%m-%dT%H:%i:%s.000Z') AS ticket_created_at,
          t.status AS ticket_status,
          DATE_FORMAT(t.solvedate, '%Y-%m-%dT%H:%i:%s.000Z') AS ticket_solved_at,
          DATE_FORMAT(t.closedate, '%Y-%m-%dT%H:%i:%s.000Z') AS ticket_closed_at
       FROM glpi_projects p
       LEFT JOIN glpi_itils_projects ip
         ON ip.id = (
          SELECT MIN(ip_first.id)
          FROM glpi_itils_projects ip_first
          WHERE ip_first.projects_id = p.id
            AND ip_first.itemtype = 'Ticket'
         )
       LEFT JOIN glpi_tickets t
         ON t.id = ip.items_id
       LEFT JOIN glpi_tickets_users req_tu
         ON req_tu.id = (
          SELECT MIN(req_first.id)
          FROM glpi_tickets_users req_first
          WHERE req_first.tickets_id = t.id
            AND req_first.type = 1
         )
       LEFT JOIN glpi_users req
         ON req.id = req_tu.users_id
       LEFT JOIN glpi_locations loc
         ON loc.id = t.locations_id
       LEFT JOIN glpi_users appr
         ON appr.id = p.users_id
       LEFT JOIN glpi_projectstates ps
         ON ps.id = p.projectstates_id
       LEFT JOIN glpi_projecttypes project_type
         ON project_type.id = p.projecttypes_id
       WHERE p.id = :projectId
         AND COALESCE(p.is_deleted, 0) = 0
       LIMIT 1`,
      { projectId } as QueryValues,
    );
    const main = mainRows[0];
    if (!main) return null;

    const requesterId = this.toPositiveOrNull(main.requester_id);
    const requesterSectorRows = requesterId
      ? await this.mysql.query<ErsRequesterSectorRow>(
          `SELECT DISTINCT
              COALESCE(NULLIF(TRIM(g.completename), ''), NULLIF(TRIM(g.name), '')) AS sector_name
           FROM glpi_groups_users gu
           INNER JOIN glpi_groups g
             ON g.id = gu.groups_id
           WHERE gu.users_id = :requesterId
             AND COALESCE(NULLIF(TRIM(g.completename), ''), NULLIF(TRIM(g.name), '')) IS NOT NULL
           ORDER BY sector_name ASC`,
          { requesterId } as QueryValues,
        )
      : [];

    const teamRows = await this.mysql.query<ErsTeamRow>(
      `SELECT
          pt.items_id AS user_id,
          COALESCE(NULLIF(CONCAT(COALESCE(u.firstname, ''), ' ', COALESCE(u.realname, '')), ' '), u.name) AS full_name
       FROM glpi_projectteams pt
       INNER JOIN glpi_users u
         ON u.id = pt.items_id
       WHERE pt.projects_id = :projectId
         AND pt.itemtype = 'User'
       ORDER BY full_name ASC`,
      { projectId } as QueryValues,
    );

    const taskRows = await this.mysql.query<ErsTaskRow>(
      `SELECT
          t.id,
          t.name,
          t.content,
          t.percent_done,
          ps.id AS project_state_id,
          ps.name AS project_state_name,
          u.id AS user_id,
          COALESCE(NULLIF(CONCAT(COALESCE(u.firstname, ''), ' ', COALESCE(u.realname, '')), ' '), u.name) AS user_name,
          DATE_FORMAT(t.plan_start_date, '%Y-%m-%dT%H:%i:%s.000Z') AS plan_start_date,
          DATE_FORMAT(t.plan_end_date, '%Y-%m-%dT%H:%i:%s.000Z') AS plan_end_date
       FROM glpi_projecttasks t
       LEFT JOIN glpi_projectstates ps
         ON ps.id = t.projectstates_id
       LEFT JOIN glpi_users u
         ON u.id = t.users_id
       WHERE t.projects_id = :projectId
       ORDER BY t.id ASC`,
      { projectId } as QueryValues,
    );

    const team: ErsTeamMember[] = teamRows.map((row) => ({
      userId: Number(row.user_id),
      fullName: String(row.full_name ?? "").trim(),
    }));

    const tasks: ErsTask[] = taskRows.map((row) => ({
      id: Number(row.id),
      name: String(row.name ?? "").trim(),
      content: this.toTextOrNull(row.content),
      percentDone: this.clampPercent(row.percent_done),
      projectStateId: this.toPositiveOrNull(row.project_state_id),
      projectStateName: this.toTextOrNull(row.project_state_name),
      userId: this.toPositiveOrNull(row.user_id),
      userName: this.toTextOrNull(row.user_name),
      planStartDate: this.toTextOrNull(row.plan_start_date),
      planEndDate: this.toTextOrNull(row.plan_end_date),
    }));

    const storedApproved = this.extractApproved(main.approved);

    return {
      projectId: Number(main.project_id),
      projectName: String(main.project_name ?? "").trim(),
      ticketId: this.toPositiveOrNull(main.ticket_id),
      requesterId,
      requesterName: this.toTextOrNull(main.requester_name),
      requesterSectors: requesterSectorRows.map((row) => String(row.sector_name).trim()),
      locationId: this.toPositiveOrNull(main.location_id),
      locationName: this.toTextOrNull(main.location_name),
      objective: this.toTextOrNull(main.objective),
      description: this.toTextOrNull(main.description),
      impact: this.extractImpactText(main.impact),
      requestType: this.extractRequestType(main.request_type),
      priority: this.toPriority(main.priority),
      approved: storedApproved ?? false,
      approverId: this.toPositiveOrNull(main.approver_id),
      approverName: this.toTextOrNull(main.approver_name),
      projectStateId: this.toPositiveOrNull(main.project_state_id),
      projectStateName: this.toTextOrNull(main.project_state_name),
      projectTypeId: this.toPositiveOrNull(main.project_type_id),
      projectTypeName: this.toTextOrNull(main.project_type_name),
      progress: this.clampPercent(main.progress),
      createdAt: this.toTextOrNull(main.created_at),
      updatedAt: this.toTextOrNull(main.updated_at),
      ticketCreatedAt: this.toTextOrNull(main.ticket_created_at),
      ticketStatus: this.toPositiveOrNull(main.ticket_status),
      ticketSolvedAt: this.toTextOrNull(main.ticket_solved_at),
      ticketClosedAt: this.toTextOrNull(main.ticket_closed_at),
      team,
      tasks,
    };
  }

  /**
   * Ejecuta la transacción 2 de edición TI en un solo guardado.
   * @param projectId - Proyecto a editar.
   * @param input - Payload completo de edición TI.
   * @returns `true` si el proyecto existía y se actualizó.
   */
  async saveTiEdition(projectId: number, actorId: number, input: UpdateErsDto): Promise<boolean> {
    return this.mysql.withTransaction(async (connection) => {
      const exists = await this.projectExists(connection, projectId);
      if (!exists) return false;

      const updateOptions: QueryOptions = {
        sql: `UPDATE glpi_projects
              SET name = COALESCE(:projectName, name),
                  content = COALESCE(:description, content),
                  comment = COALESCE(:objective, comment),
                  users_id = :approverId,
                  projectstates_id = :projectStateId,
                  projecttypes_id = COALESCE(:projectTypeId, projecttypes_id),
                  priority = :priority,
                  date_mod = NOW()
              WHERE id = :projectId
                AND COALESCE(is_deleted, 0) = 0`,
        namedPlaceholders: true,
      };
      await connection.query(updateOptions, {
        projectId,
        projectName: this.toTextOrNull(input.projectName),
        description: this.toTextOrNull(input.description),
        objective: this.toTextOrNull(input.objective),
        approverId: this.toPositiveOrNull(input.approverId) ?? 0,
        projectStateId: this.toPositiveOrNull(input.projectStateId) ?? 0,
        projectTypeId:
          input.projectTypeId === undefined
            ? null
            : this.toPositiveOrNull(input.projectTypeId) ?? 0,
        priority: input.priority,
      } as QueryValues);

      await this.syncImpactNote(connection, {
        projectId,
        actorId,
        impact: input.impact ?? "",
      });
      await this.syncRequestTypeNote(connection, {
        projectId,
        actorId,
        requestType: input.requestType,
      });
      await this.syncApprovedNote(connection, {
        projectId,
        actorId,
        approved: input.approved,
      });
      await this.replaceProjectTeam(connection, projectId, input.teamMemberIds);
      if (input.approved) {
        await this.replaceProjectTasks(connection, projectId, input.tasks);
      }
      return true;
    });
  }

  /**
   * Lista estados de proyecto.
   * @returns Estados de `glpi_projectstates`.
   */
  async listProjectStates(): Promise<ErsProjectState[]> {
    const rows = await this.mysql.query<ProjectStateRow>(
      `SELECT id, name, color, COALESCE(is_finished, 0) AS is_finished
       FROM glpi_projectstates
       ORDER BY id ASC`,
    );
    return rows.map((row) => ({
      id: Number(row.id),
      name: String(row.name ?? "").trim(),
      color: this.toTextOrNull(row.color),
      isFinished: Number(row.is_finished) === 1,
    }));
  }

  /** Lista los sistemas relacionados configurados en GLPI. */
  async listProjectTypes(): Promise<ErsProjectType[]> {
    const rows = await this.mysql.query<ProjectTypeRow>(
      `SELECT id, name
       FROM glpi_projecttypes
       WHERE COALESCE(name, '') <> ''
       ORDER BY name ASC, id ASC`,
    );
    return rows.map((row) => ({
      id: Number(row.id),
      name: String(row.name ?? "").trim(),
    }));
  }

  /** Comprueba que un sistema relacionado exista en GLPI. */
  async projectTypeExists(projectTypeId: number): Promise<boolean> {
    const rows = await this.mysql.query<ProjectIdRow>(
      `SELECT id
       FROM glpi_projecttypes
       WHERE id = :projectTypeId
       LIMIT 1`,
      { projectTypeId } as QueryValues,
    );
    return rows.length > 0;
  }

  private async hasProjectLinkInTx(connection: PoolConnection, ticketId: number): Promise<boolean> {
    const options: QueryOptions = {
      sql: `SELECT projects_id AS id
            FROM glpi_itils_projects
            WHERE itemtype = 'Ticket'
              AND items_id = :ticketId
            LIMIT 1`,
      namedPlaceholders: true,
    };
    const [rows] = await connection.query<ProjectIdRow[]>(options, { ticketId } as QueryValues);
    return rows.length > 0;
  }

  private async isTicketEligibleInTx(connection: PoolConnection, ticketId: number): Promise<boolean> {
    const options: QueryOptions = {
      sql: `SELECT id
            FROM glpi_tickets
            WHERE id = :ticketId
              AND COALESCE(is_deleted, 0) = 0
              AND status NOT IN (5, 6)
            LIMIT 1`,
      namedPlaceholders: true,
    };
    const [rows] = await connection.query<TicketEligibilityRow[]>(options, { ticketId } as QueryValues);
    return rows.length > 0;
  }

  private async resolveDefaultProjectStateId(connection: PoolConnection): Promise<number | null> {
    const options: QueryOptions = {
      sql: `SELECT id
            FROM glpi_projectstates
            WHERE COALESCE(is_finished, 0) = 0
            ORDER BY id ASC
            LIMIT 1`,
      namedPlaceholders: true,
    };
    const [rows] = await connection.query<ProjectIdRow[]>(options);
    const stateId = rows[0]?.id;
    return this.toPositiveOrNull(stateId);
  }

  private async insertProject(
    connection: PoolConnection,
    input: {
      projectName: string;
      objective?: string;
      description?: string;
      entityId: number;
      projectStateId: number | null;
      projectTypeId?: number | null;
      approverId?: number | null;
      priority?: number;
    },
  ): Promise<number> {
    const options: QueryOptions = {
      sql: `INSERT INTO glpi_projects (
              name,
              code,
              content,
              comment,
              users_id,
              projectstates_id,
              projecttypes_id,
              priority,
              percent_done,
              entities_id,
              date,
              date_creation,
              date_mod,
              is_deleted
            ) VALUES (
              :name,
              '',
              :content,
              :comment,
              :approverId,
              :projectStateId,
              :projectTypeId,
              :priority,
              0,
              :entityId,
              NOW(),
              NOW(),
              NOW(),
              0
            )`,
      namedPlaceholders: true,
    };
    const [result] = await connection.query<ResultSetHeader>(options, {
      name: input.projectName.trim(),
      content: (input.description ?? "").trim(),
      comment: (input.objective ?? "").trim(),
      projectStateId: input.projectStateId ?? 0,
      projectTypeId: input.projectTypeId ?? 0,
      approverId: input.approverId ?? 0,
      priority: input.priority ?? 3,
      entityId: input.entityId,
    } as QueryValues);

    const projectId = Number(result.insertId ?? 0);
    if (!Number.isFinite(projectId) || projectId <= 0) {
      throw new Error("project_insert_failed");
    }
    return projectId;
  }

  private async insertTicketProjectLink(
    connection: PoolConnection,
    ticketId: number,
    projectId: number,
  ): Promise<void> {
    const options: QueryOptions = {
      sql: `INSERT INTO glpi_itils_projects (itemtype, items_id, projects_id)
            VALUES ('Ticket', :ticketId, :projectId)`,
      namedPlaceholders: true,
    };
    await connection.query(options, { ticketId, projectId } as QueryValues);
  }

  private async insertImpactNote(
    connection: PoolConnection,
    input: { projectId: number; actorId: number; impact: string },
  ): Promise<void> {
    const normalized = this.wrapImpact(input.impact.trim());
    const options: QueryOptions = {
      sql: `INSERT INTO glpi_notepads (
              users_id,
              itemtype,
              items_id,
              date,
              date_mod,
              content
            ) VALUES (
              :actorId,
              'Project',
              :projectId,
              NOW(),
              NOW(),
              :content
            )`,
      namedPlaceholders: true,
    };
    await connection.query(options, {
      actorId: input.actorId,
      projectId: input.projectId,
      content: normalized,
    } as QueryValues);
  }

  private async syncImpactNote(
    connection: PoolConnection,
    input: { projectId: number; actorId: number; impact: string },
  ): Promise<void> {
    const normalizedImpact = input.impact.trim();
    if (!normalizedImpact) {
      await this.deleteImpactNote(connection, input.projectId);
      return;
    }

    const existingNoteId = await this.findLatestImpactNoteId(connection, input.projectId);
    if (!existingNoteId) {
      await this.insertImpactNote(connection, input);
      return;
    }

    const updateOptions: QueryOptions = {
      sql: `UPDATE glpi_notepads
            SET users_id = :actorId,
                content = :content,
                date_mod = NOW()
            WHERE id = :noteId`,
      namedPlaceholders: true,
    };
    await connection.query(updateOptions, {
      actorId: input.actorId,
      noteId: existingNoteId,
      content: this.wrapImpact(normalizedImpact),
    } as QueryValues);
  }

  private async findLatestImpactNoteId(
    connection: PoolConnection,
    projectId: number,
  ): Promise<number | null> {
    const options: QueryOptions = {
      sql: `SELECT n.id
            FROM glpi_notepads n
            WHERE n.itemtype = 'Project'
              AND n.items_id = :projectId
              AND LOWER(COALESCE(n.content, '')) LIKE '%[impacto]%'
            ORDER BY n.id DESC
            LIMIT 1`,
      namedPlaceholders: true,
    };
    const [rows] = await connection.query<ImpactNoteRow[]>(options, { projectId } as QueryValues);
    return this.toPositiveOrNull(rows[0]?.id);
  }

  private async syncRequestTypeNote(
    connection: PoolConnection,
    input: { projectId: number; actorId: number; requestType: string },
  ): Promise<void> {
    const content = this.wrapRequestType(input.requestType.trim());
    const noteId = await this.findLatestRequestTypeNoteId(connection, input.projectId);
    if (!noteId) {
      const options: QueryOptions = {
        sql: `INSERT INTO glpi_notepads (
                users_id,
                itemtype,
                items_id,
                date,
                date_mod,
                content
              ) VALUES (
                :actorId,
                'Project',
                :projectId,
                NOW(),
                NOW(),
                :content
              )`,
        namedPlaceholders: true,
      };
      await connection.query(options, {
        actorId: input.actorId,
        projectId: input.projectId,
        content,
      } as QueryValues);
      return;
    }

    const options: QueryOptions = {
      sql: `UPDATE glpi_notepads
            SET users_id = :actorId,
                content = :content,
                date_mod = NOW()
            WHERE id = :noteId`,
      namedPlaceholders: true,
    };
    await connection.query(options, {
      actorId: input.actorId,
      content,
      noteId,
    } as QueryValues);
  }

  private async findLatestRequestTypeNoteId(
    connection: PoolConnection,
    projectId: number,
  ): Promise<number | null> {
    const options: QueryOptions = {
      sql: `SELECT n.id
            FROM glpi_notepads n
            WHERE n.itemtype = 'Project'
              AND n.items_id = :projectId
              AND LOWER(COALESCE(n.content, '')) LIKE '%[tipo]%'
            ORDER BY n.id DESC
            LIMIT 1`,
      namedPlaceholders: true,
    };
    const [rows] = await connection.query<ImpactNoteRow[]>(options, { projectId } as QueryValues);
    return this.toPositiveOrNull(rows[0]?.id);
  }

  private async syncApprovedNote(
    connection: PoolConnection,
    input: { projectId: number; actorId: number; approved: boolean },
  ): Promise<void> {
    const content = this.wrapApproved(input.approved);
    const noteId = await this.findLatestApprovedNoteId(connection, input.projectId);
    if (!noteId) {
      const options: QueryOptions = {
        sql: `INSERT INTO glpi_notepads (
                users_id, itemtype, items_id, date, date_mod, content
              ) VALUES (
                :actorId, 'Project', :projectId, NOW(), NOW(), :content
              )`,
        namedPlaceholders: true,
      };
      await connection.query(options, {
        actorId: input.actorId,
        projectId: input.projectId,
        content,
      } as QueryValues);
      return;
    }

    const options: QueryOptions = {
      sql: `UPDATE glpi_notepads
            SET users_id = :actorId,
                content = :content,
                date_mod = NOW()
            WHERE id = :noteId`,
      namedPlaceholders: true,
    };
    await connection.query(options, {
      actorId: input.actorId,
      content,
      noteId,
    } as QueryValues);
  }

  private async findLatestApprovedNoteId(
    connection: PoolConnection,
    projectId: number,
  ): Promise<number | null> {
    const options: QueryOptions = {
      sql: `SELECT n.id
            FROM glpi_notepads n
            WHERE n.itemtype = 'Project'
              AND n.items_id = :projectId
              AND LOWER(COALESCE(n.content, '')) LIKE '%[aprobado]%'
            ORDER BY n.id DESC
            LIMIT 1`,
      namedPlaceholders: true,
    };
    const [rows] = await connection.query<ImpactNoteRow[]>(options, { projectId } as QueryValues);
    return this.toPositiveOrNull(rows[0]?.id);
  }

  private async deleteImpactNote(connection: PoolConnection, projectId: number): Promise<void> {
    const options: QueryOptions = {
      sql: `DELETE FROM glpi_notepads
            WHERE itemtype = 'Project'
              AND items_id = :projectId
              AND LOWER(COALESCE(content, '')) LIKE '%[impacto]%'`,
      namedPlaceholders: true,
    };
    await connection.query(options, { projectId } as QueryValues);
  }

  private async insertProjectTeamUser(
    connection: PoolConnection,
    projectId: number,
    userId: number,
  ): Promise<void> {
    const options: QueryOptions = {
      sql: `INSERT INTO glpi_projectteams (projects_id, itemtype, items_id)
            VALUES (:projectId, 'User', :userId)`,
      namedPlaceholders: true,
    };
    await connection.query(options, { projectId, userId } as QueryValues);
  }

  private async appendEscalationClosureNote(connection: PoolConnection, ticketId: number): Promise<void> {
    const currentContent = await this.getTicketContentInTx(connection, ticketId);
    const updatedContent = appendResolutionNote(currentContent, ERS_ESCALATION_CLOSURE_NOTE);
    const options: QueryOptions = {
      sql: `UPDATE glpi_tickets
            SET content = :content,
                date_mod = NOW()
            WHERE id = :ticketId
              AND COALESCE(is_deleted, 0) = 0`,
      namedPlaceholders: true,
    };
    await connection.query(options, { ticketId, content: updatedContent } as QueryValues);
  }

  private async getTicketContentInTx(
    connection: PoolConnection,
    ticketId: number,
  ): Promise<string | null> {
    const options: QueryOptions = {
      sql: `SELECT content
            FROM glpi_tickets
            WHERE id = :ticketId
              AND COALESCE(is_deleted, 0) = 0
            LIMIT 1`,
      namedPlaceholders: true,
    };
    const [rows] = await connection.query<TicketContentRow[]>(options, { ticketId } as QueryValues);
    return rows[0]?.content ?? null;
  }

  private async closeTicket(connection: PoolConnection, ticketId: number): Promise<void> {
    const options: QueryOptions = {
      sql: `UPDATE glpi_tickets
            SET status = 6,
                solvedate = COALESCE(solvedate, NOW()),
                closedate = NOW(),
                date_mod = NOW()
            WHERE id = :ticketId
              AND COALESCE(is_deleted, 0) = 0`,
      namedPlaceholders: true,
    };
    await connection.query(options, { ticketId } as QueryValues);
  }

  private async projectExists(connection: PoolConnection, projectId: number): Promise<boolean> {
    const options: QueryOptions = {
      sql: `SELECT id
            FROM glpi_projects
            WHERE id = :projectId
              AND COALESCE(is_deleted, 0) = 0
            LIMIT 1`,
      namedPlaceholders: true,
    };
    const [rows] = await connection.query<ProjectIdRow[]>(options, { projectId } as QueryValues);
    return rows.length > 0;
  }

  private async replaceProjectTeam(
    connection: PoolConnection,
    projectId: number,
    members: number[],
  ): Promise<void> {
    const deleteOptions: QueryOptions = {
      sql: `DELETE FROM glpi_projectteams
            WHERE projects_id = :projectId
              AND itemtype = 'User'`,
      namedPlaceholders: true,
    };
    await connection.query(deleteOptions, { projectId } as QueryValues);

    const uniqueMembers = this.uniquePositive(members);
    for (const memberId of uniqueMembers) {
      await this.insertProjectTeamUser(connection, projectId, memberId);
    }
  }

  private async replaceProjectTasks(
    connection: PoolConnection,
    projectId: number,
    tasks: ErsTaskInputDto[],
  ): Promise<void> {
    const deleteOptions: QueryOptions = {
      sql: `DELETE FROM glpi_projecttasks
            WHERE projects_id = :projectId`,
      namedPlaceholders: true,
    };
    await connection.query(deleteOptions, { projectId } as QueryValues);

    for (const task of tasks) {
      const insertOptions: QueryOptions = {
        sql: `INSERT INTO glpi_projecttasks (
                projects_id,
                name,
                content,
                percent_done,
                projectstates_id,
                users_id,
                plan_start_date,
                plan_end_date,
                date_mod
              ) VALUES (
                :projectId,
                :name,
                :content,
                :percentDone,
                :projectStateId,
                :userId,
                :planStartDate,
                :planEndDate,
                NOW()
              )`,
        namedPlaceholders: true,
      };
      await connection.query(insertOptions, {
        projectId,
        name: task.name.trim(),
        content: (task.content ?? "").trim(),
        percentDone: this.clampPercent(task.percentDone),
        projectStateId: this.toPositiveOrNull(task.projectStateId) ?? 0,
        userId: this.toPositiveOrNull(task.userId) ?? 0,
        planStartDate: task.planStartDate ?? null,
        planEndDate: task.planEndDate ?? null,
      } as QueryValues);
    }

    await this.syncProjectProgress(connection, projectId);
  }

  /** Persiste en GLPI el promedio de avance de las tareas no canceladas. */
  private async syncProjectProgress(
    connection: PoolConnection,
    projectId: number,
  ): Promise<void> {
    const options: QueryOptions = {
      sql: `UPDATE glpi_projects p
            SET p.percent_done = ROUND(COALESCE((
              SELECT AVG(COALESCE(t.percent_done, 0))
              FROM glpi_projecttasks t
              LEFT JOIN glpi_projectstates state
                ON state.id = t.projectstates_id
              WHERE t.projects_id = p.id
                AND (
                  t.projectstates_id IS NULL
                  OR LOWER(COALESCE(state.name, '')) NOT REGEXP 'cancel|rechaz|anulad'
                )
            ), 0), 0)
            WHERE p.id = :projectId
              AND COALESCE(p.is_deleted, 0) = 0`,
      namedPlaceholders: true,
    };
    await connection.query(options, { projectId } as QueryValues);
  }

  private wrapImpact(value: string): string {
    if (!value) return "";
    return `[IMPACTO]\n${value}\n[/IMPACTO]`;
  }

  private extractImpactText(value: string | null): string | null {
    if (!value) return null;
    const match = value.match(/\[IMPACTO\]([\s\S]*?)\[\/IMPACTO\]/i);
    if (!match) return this.toTextOrNull(value);
    const normalized = match[1]?.trim() ?? "";
    return normalized.length > 0 ? normalized : null;
  }

  private wrapRequestType(value: string): string {
    return `[TIPO]${value}[/TIPO]`;
  }

  private extractRequestType(value: string | null): string | null {
    if (!value) return null;
    const match = value.match(/\[TIPO\]([\s\S]*?)\[\/TIPO\]/i);
    if (!match) return this.toTextOrNull(value);
    return this.toTextOrNull(match[1]);
  }

  private wrapApproved(value: boolean): string {
    return `[APROBADO]${value ? "SI" : "NO"}[/APROBADO]`;
  }

  private extractApproved(value: string | null): boolean | null {
    if (!value) return null;
    const match = value.match(/\[APROBADO\]([\s\S]*?)\[\/APROBADO\]/i);
    if (!match) return null;
    const normalized = (match[1] ?? "").trim().toLocaleUpperCase("es");
    if (normalized === "SI" || normalized === "SÍ") return true;
    if (normalized === "NO") return false;
    return null;
  }

  private toPositiveOrNull(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private toTextOrNull(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
  }

  private clampPercent(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(100, Math.round(parsed)));
  }

  private toPriority(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 6) return 3;
    return parsed;
  }

  private uniquePositive(values: number[]): number[] {
    const normalized = values
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0);
    return Array.from(new Set(normalized));
  }
}

