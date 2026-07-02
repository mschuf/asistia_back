/**
 * @file ers-history.sql-repository.ts
 * @description Repositorio SQL para historial ERS en PostgreSQL y datos auxiliares en MySQL.
 */
import { Injectable } from "@nestjs/common";
import type { QueryValues, RowDataPacket } from "mysql2";
import { MysqlService } from "../../mysql/mysql.service";
import { PostgresService } from "../../postgres/postgres.service";
import type { CreateErsHistoryInput, ErsHistoryItem } from "../ers-history.types";

interface ErsProjectAccessRow extends RowDataPacket {
  project_id: number;
  project_name: string;
  ticket_id: number | null;
  requester_id: number | null;
}

interface ActorNameRow extends RowDataPacket {
  display_name: string | null;
}

const ACTION_COLOR_MAP: Record<"create" | "update" | "delete", string> = {
  create: "success",
  update: "info",
  delete: "danger",
};

/** Repositorio para persistencia/lectura de historial ERS. */
@Injectable()
export class ErsHistorySqlRepository {
  constructor(
    private readonly postgres: PostgresService,
    private readonly mysql: MysqlService,
  ) {}

  /**
   * Busca datos de acceso del proyecto para validar alcance del usuario.
   * @param projectId - ID del proyecto ERS.
   * @returns Datos de acceso o `null` si no existe.
   */
  async findProjectAccess(projectId: number): Promise<{
    projectId: number;
    projectName: string;
    ticketId: number | null;
    requesterId: number | null;
  } | null> {
    const rows = await this.mysql.query<ErsProjectAccessRow>(
      `SELECT
          p.id AS project_id,
          p.name AS project_name,
          ip.items_id AS ticket_id,
          req_tu.users_id AS requester_id
       FROM glpi_projects p
       LEFT JOIN glpi_itils_projects ip
         ON ip.id = (
          SELECT MIN(ip_first.id)
          FROM glpi_itils_projects ip_first
          WHERE ip_first.projects_id = p.id
            AND ip_first.itemtype = 'Ticket'
         )
       LEFT JOIN glpi_tickets_users req_tu
         ON req_tu.id = (
          SELECT MIN(req_first.id)
          FROM glpi_tickets_users req_first
          WHERE req_first.tickets_id = ip.items_id
            AND req_first.type = 1
         )
       WHERE p.id = :projectId
         AND COALESCE(p.is_deleted, 0) = 0
       LIMIT 1`,
      { projectId } as QueryValues,
    );
    const row = rows[0];
    if (!row) return null;

    return {
      projectId: Number(row.project_id),
      projectName: String(row.project_name ?? "").trim(),
      ticketId: this.toPositiveOrNull(row.ticket_id),
      requesterId: this.toPositiveOrNull(row.requester_id),
    };
  }

  /**
   * Resuelve nombre visible del actor desde GLPI users.
   * @param actorUserId - ID del usuario actor.
   * @returns Nombre visible o fallback técnico.
   */
  async resolveActorDisplayName(actorUserId: number): Promise<string> {
    const rows = await this.mysql.query<ActorNameRow>(
      `SELECT
          COALESCE(
            NULLIF(CONCAT(COALESCE(u.firstname, ''), ' ', COALESCE(u.realname, '')), ' '),
            NULLIF(u.name, ''),
            NULL
          ) AS display_name
       FROM glpi_users u
       WHERE u.id = :actorUserId
       LIMIT 1`,
      { actorUserId } as QueryValues,
    );
    const displayName = rows[0]?.display_name?.trim();
    if (displayName) return displayName;
    return `Usuario #${actorUserId}`;
  }

  /**
   * Inserta un evento de historial en PostgreSQL.
   * @param input - Datos del evento.
   * @returns Evento persistido.
   */
  async create(input: CreateErsHistoryInput): Promise<ErsHistoryItem> {
    const rows = await this.postgres.query<ErsHistoryItem>(
      `INSERT INTO public.ers_project_history (
          project_id,
          action_type,
          action_color,
          summary,
          actor_user_id,
          actor_display_name,
          metadata_json,
          before_state,
          after_state
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb)
       RETURNING
          id,
          project_id AS "projectId",
          action_type AS "actionType",
          action_color AS "actionColor",
          summary,
          actor_user_id AS "actorUserId",
          actor_display_name AS "actorDisplayName",
          happened_at AS "happenedAt",
          before_state AS "beforeState",
          after_state AS "afterState"`,
      [
        input.projectId,
        input.actionType,
        ACTION_COLOR_MAP[input.actionType],
        input.summary.trim(),
        input.actorUserId,
        input.actorDisplayName.trim(),
        JSON.stringify(input.metadata ?? {}),
        input.beforeState ? JSON.stringify(input.beforeState) : null,
        input.afterState ? JSON.stringify(input.afterState) : null,
      ],
    );
    return rows[0];
  }

  /**
   * Lista historial paginado por proyecto (más reciente primero).
   * @param projectId - Proyecto ERS.
   * @param page - Página 1-indexada.
   * @param limit - Tamaño de página.
   * @returns Items y total.
   */
  async listByProject(
    projectId: number,
    page: number,
    limit: number,
  ): Promise<{ items: ErsHistoryItem[]; total: number; page: number; limit: number }> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, limit);
    const offset = (safePage - 1) * safeLimit;

    const totalRows = await this.postgres.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM public.ers_project_history
       WHERE project_id = $1`,
      [projectId],
    );
    const total = Number(totalRows[0]?.total ?? 0);

    const items = await this.postgres.query<ErsHistoryItem>(
      `SELECT
          id,
          project_id AS "projectId",
          action_type AS "actionType",
          action_color AS "actionColor",
          summary,
          actor_user_id AS "actorUserId",
          actor_display_name AS "actorDisplayName",
          happened_at AS "happenedAt",
          before_state AS "beforeState",
          after_state AS "afterState"
       FROM public.ers_project_history
       WHERE project_id = $1
       ORDER BY happened_at DESC, id DESC
       LIMIT $2
       OFFSET $3`,
      [projectId, safeLimit, offset],
    );

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
    };
  }

  private toPositiveOrNull(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
}

