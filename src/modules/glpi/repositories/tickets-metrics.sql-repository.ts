/**
 * @file tickets-metrics.sql-repository.ts
 * @description Agregados SQL de indicadores de tickets (técnico, solicitante y sede).
 */
import { Injectable } from "@nestjs/common";
import type { QueryValues } from "mysql2";
import type { RowDataPacket } from "mysql2/promise";
import { GLPI_TICKET_STATUS, GLPI_TICKET_TYPE, GLPI_TICKET_USER_TYPE } from "../glpi.constants";
import { MysqlService } from "../../mysql/mysql.service";
import {
  EMPTY_METRIC_SLICE,
  MY_GROUP_HISTORY_STATUS_GLPI,
  OPEN_STATUS_GLPI,
  openPercent,
} from "../../tickets/domain/ticket-metrics.helpers";
import type { TicketMetricsResponseDto } from "../../tickets/dto/ticket-metrics.response.dto";

const METRICS_SITE_LIMIT = 50000;
const OPEN_STATUS_IN = OPEN_STATUS_GLPI.join(", ");
const MY_GROUP_STATUS_IN = MY_GROUP_HISTORY_STATUS_GLPI.join(", ");
const BASE_TICKET_HISTORY_SQL = `
  SELECT
    t.id AS ticket_id,
    t.is_deleted,
    t.type AS type_glpi,
    t.status AS status_glpi,
    t.locations_id AS location_id,
    t.date AS created_at,
    tech.users_id AS technician_id
  FROM glpi_tickets t
  LEFT JOIN glpi_tickets_users tech
    ON tech.tickets_id = t.id
   AND tech.type = 2
   AND tech.id = (
    SELECT MIN(tu_min.id)
    FROM glpi_tickets_users tu_min
    WHERE tu_min.tickets_id = t.id
      AND tu_min.type = 2
  )
`;

interface AssignedAggregateRow extends RowDataPacket {
  in_progress: number | string | null;
  open_this_month: number | string | null;
  total_this_month: number | string | null;
}

interface SiteAggregateRow extends RowDataPacket {
  open_count: number | string | null;
  open_this_month: number | string | null;
  total_this_month: number | string | null;
}

interface RequesterStatusAggregateRow extends RowDataPacket {
  solved_count: number | string | null;
  closed_count: number | string | null;
  solved_this_month: number | string | null;
  closed_this_month: number | string | null;
  total_this_month: number | string | null;
}

interface GlobalOpenByLocationRow extends RowDataPacket {
  location_id: number;
  name: string | null;
  open_count: number | string;
}

export interface MetricsForTechnicianInput {
  technicianId: number;
  locationId: number | null | undefined;
}

export interface MetricsForRequesterInput {
  requesterId: number;
  locationId: number | null | undefined;
}

const BASE_TICKET_WITH_REQUESTER_SQL = `
  SELECT
    t.id AS ticket_id,
    t.is_deleted,
    t.type AS type_glpi,
    t.status AS status_glpi,
    t.locations_id AS location_id,
    t.date AS created_at,
    req.users_id AS requester_id
  FROM glpi_tickets t
  LEFT JOIN glpi_tickets_users req
    ON req.tickets_id = t.id
   AND req.type = ${GLPI_TICKET_USER_TYPE.REQUESTER}
   AND req.id = (
    SELECT MIN(tu_min.id)
    FROM glpi_tickets_users tu_min
    WHERE tu_min.tickets_id = t.id
      AND tu_min.type = ${GLPI_TICKET_USER_TYPE.REQUESTER}
  )
`;

@Injectable()
/**
 * Repositorio SQL de métricas e indicadores de tickets.
 */
export class TicketsMetricsSqlRepository {
  constructor(private readonly mysql: MysqlService) {}

  /**

   * Calcula indicadores completos para un técnico y sede opcional.
   * @returns Resultado de la operación.
   * @throws Error de base de datos si la consulta falla.
   * @param input - Parámetro `input`.
   * @returns `Promise<TicketMetricsResponseDto>`
   */
  async getMetricsForTechnician(
    input: MetricsForTechnicianInput,
  ): Promise<TicketMetricsResponseDto>  {
    const technicianId = input.technicianId;
    const [myTickets, myIncidents, myRequests, myGroup, mySite, openByLocationRows] =
      await Promise.all([
        this.aggregateMyTickets(technicianId),
        this.aggregateTypeSlice(technicianId, GLPI_TICKET_TYPE.INCIDENT),
        this.aggregateTypeSlice(technicianId, GLPI_TICKET_TYPE.REQUEST),
        this.aggregateMyGroupSlice(),
        input.locationId != null
          ? this.aggregateSiteSlice(input.locationId)
          : Promise.resolve(null),
        this.listGlobalOpenByLocation(),
      ]);

    const openByLocation = openByLocationRows.map((row) => {
      const locationId = Number(row.location_id);
      return {
        locationId,
        name: row.name?.trim() || `Sede #${locationId}`,
        open: Number(row.open_count) || 0,
      };
    });

    return {
      myTickets,
      mySite,
      myIncidents,
      myRequests,
      myGroup,
      mySolved: EMPTY_METRIC_SLICE,
      myClosed: EMPTY_METRIC_SLICE,
      openByLocation,
    };
  }

  /**

   * Agrega tickets del equipo con filtro historial "Abiertos" (asignado + planificado).
   * @returns Resultado de la operación.
   * @throws Error de base de datos si la consulta falla.
   * @returns `Promise<`
   */
  async aggregateMyGroupSlice(): Promise< {
    open: number;
    openPercent: number;
    openThisMonth: number;
    totalThisMonth: number;
  }> {
    const rows = await this.mysql.query<SiteAggregateRow>(
      `SELECT
         SUM(CASE WHEN status_glpi IN (${MY_GROUP_STATUS_IN}) THEN 1 ELSE 0 END) AS open_count,
         SUM(
           CASE
             WHEN status_glpi IN (${MY_GROUP_STATUS_IN})
              AND YEAR(created_at) = YEAR(UTC_TIMESTAMP())
              AND MONTH(created_at) = MONTH(UTC_TIMESTAMP())
             THEN 1 ELSE 0
           END
         ) AS open_this_month,
         SUM(
           CASE
             WHEN YEAR(created_at) = YEAR(UTC_TIMESTAMP())
              AND MONTH(created_at) = MONTH(UTC_TIMESTAMP())
             THEN 1 ELSE 0
           END
         ) AS total_this_month
       FROM v_asistia_ticket_history
       WHERE is_deleted = 0`,
    );

    const row = rows[0];
    const open = Number(row?.open_count ?? 0);
    const openThisMonth = Number(row?.open_this_month ?? 0);
    const totalThisMonth = Number(row?.total_this_month ?? 0);

    return {
      open,
      openPercent: openPercent(openThisMonth, totalThisMonth),
      openThisMonth,
      totalThisMonth,
    };
  }

  /**

   * Agrega Mis Tickets del técnico (en curso y porcentajes del mes).
   * @returns Resultado de la operación.
   * @throws Error de base de datos si la consulta falla.
   * @param technicianId - Parámetro `technicianId`.
   * @returns `Promise<`
   */
  private async aggregateMyTickets(technicianId: number): Promise< {
    inProgress: number;
    openPercent: number;
    openThisMonth: number;
    totalThisMonth: number;
  }> {
    const row = await this.queryAssignedAggregate(technicianId, null);
    const openThisMonth = Number(row?.open_this_month ?? 0);
    const totalThisMonth = Number(row?.total_this_month ?? 0);
    return {
      inProgress: Number(row?.in_progress ?? 0),
      openPercent: openPercent(openThisMonth, totalThisMonth),
      openThisMonth,
      totalThisMonth,
    };
  }

  /**

   * Agrega incidentes o solicitudes asignadas al técnico.
   * @returns Resultado de la operación.
   * @throws Error de base de datos si la consulta falla.
   * @param technicianId - Parámetro `technicianId`.
   * @param typeGlpi - Parámetro `typeGlpi`.
   * @returns `Promise<`
   */
  private async aggregateTypeSlice(
    technicianId: number,
    typeGlpi: number,
  ): Promise< {
    open: number;
    openPercent: number;
    openThisMonth: number;
    totalThisMonth: number;
  }> {
    const row = await this.queryAssignedAggregate(technicianId, typeGlpi);
    const openThisMonth = Number(row?.open_this_month ?? 0);
    const totalThisMonth = Number(row?.total_this_month ?? 0);
    return {
      open: Number(row?.in_progress ?? 0),
      openPercent: openPercent(openThisMonth, totalThisMonth),
      openThisMonth,
      totalThisMonth,
    };
  }

  /**

   * Ejecuta SQL de agregación por técnico y tipo opcional.
   * @returns Resultado de la operación.
   * @throws Error de base de datos si la consulta falla.
   * @param technicianId - Parámetro `technicianId`.
   * @param typeGlpi - Parámetro `typeGlpi`.
   * @returns `Promise<AssignedAggregateRow | undefined>`
   */
  private async queryAssignedAggregate(
    technicianId: number,
    typeGlpi: number | null,
  ): Promise<AssignedAggregateRow | undefined>  {
    const typeClause = typeGlpi != null ? "AND type_glpi = :typeGlpi" : "";
    const params: Record<string, unknown> = { technicianId };
    if (typeGlpi != null) params.typeGlpi = typeGlpi;

    const rows = await this.mysql.query<AssignedAggregateRow>(
      `SELECT
         SUM(CASE WHEN status_glpi IN (${OPEN_STATUS_IN}) THEN 1 ELSE 0 END) AS in_progress,
         SUM(
           CASE
             WHEN status_glpi IN (${OPEN_STATUS_IN})
              AND YEAR(created_at) = YEAR(UTC_TIMESTAMP())
              AND MONTH(created_at) = MONTH(UTC_TIMESTAMP())
             THEN 1 ELSE 0
           END
         ) AS open_this_month,
         SUM(
           CASE
             WHEN YEAR(created_at) = YEAR(UTC_TIMESTAMP())
              AND MONTH(created_at) = MONTH(UTC_TIMESTAMP())
             THEN 1 ELSE 0
           END
         ) AS total_this_month
       FROM (${BASE_TICKET_HISTORY_SQL}) th
       WHERE is_deleted = 0
         AND technician_id = :technicianId
         ${typeClause}`,
      params as QueryValues,
    );
    return rows[0];
  }

  /**

   * Agrega tickets abiertos de una sede (Mi Sede).
   * @returns Resultado de la operación.
   * @throws Error de base de datos si la consulta falla.
   * @param locationId - Parámetro `locationId`.
   * @returns `Promise<`
   */
  private async aggregateSiteSlice(
    locationId: number,
  ): Promise< {
    open: number;
    openPercent: number;
    openThisMonth: number;
    totalThisMonth: number;
  }> {
    const rows = await this.mysql.query<SiteAggregateRow>(
      `SELECT
         COUNT(*) AS open_count,
         SUM(
           CASE
             WHEN status_glpi IN (${OPEN_STATUS_IN})
              AND YEAR(created_at) = YEAR(UTC_TIMESTAMP())
              AND MONTH(created_at) = MONTH(UTC_TIMESTAMP())
             THEN 1 ELSE 0
           END
         ) AS open_this_month,
         SUM(
           CASE
             WHEN YEAR(created_at) = YEAR(UTC_TIMESTAMP())
              AND MONTH(created_at) = MONTH(UTC_TIMESTAMP())
             THEN 1 ELSE 0
           END
         ) AS total_this_month
       FROM (
         SELECT status_glpi, created_at
         FROM (${BASE_TICKET_HISTORY_SQL}) th
         WHERE is_deleted = 0
           AND location_id = :locationId
           AND status_glpi IN (${OPEN_STATUS_IN})
         LIMIT ${METRICS_SITE_LIMIT}
       ) site_pool`,
      { locationId } as QueryValues,
    );

    const row = rows[0];
    const open = Number(row?.open_count ?? 0);
    const openThisMonth = Number(row?.open_this_month ?? 0);
    const totalThisMonth = Number(row?.total_this_month ?? 0);

    return {
      open,
      openPercent: openPercent(openThisMonth, totalThisMonth),
      openThisMonth,
      totalThisMonth,
    };
  }

  /**

   * Calcula indicadores para un solicitante y sede opcional.
   * @returns Resultado de la operación.
   * @throws Error de base de datos si la consulta falla.
   * @param input - Parámetro `input`.
   * @returns `Promise<TicketMetricsResponseDto>`
   */
  async getMetricsForRequester(
    input: MetricsForRequesterInput,
  ): Promise<TicketMetricsResponseDto>  {
    const requesterId = input.requesterId;
    const [myTickets, statusSlices, mySite, openByLocationRows] = await Promise.all([
      this.aggregateRequesterMyTickets(requesterId),
      this.aggregateRequesterSolvedClosedSlices(requesterId),
      input.locationId != null
        ? this.aggregateRequesterSiteSlice(requesterId, input.locationId)
        : Promise.resolve(null),
      this.listRequesterOpenByLocation(requesterId),
    ]);

    const openByLocation = openByLocationRows.map((row) => {
      const locationId = Number(row.location_id);
      return {
        locationId,
        name: row.name?.trim() || `Sede #${locationId}`,
        open: Number(row.open_count) || 0,
      };
    });

    return {
      myTickets,
      mySite,
      myIncidents: EMPTY_METRIC_SLICE,
      myRequests: EMPTY_METRIC_SLICE,
      myGroup: EMPTY_METRIC_SLICE,
      mySolved: statusSlices.solved,
      myClosed: statusSlices.closed,
      openByLocation,
    };
  }

  /**

   * Agrega tickets del solicitante en curso y del mes.
   * @returns Resultado de la operación.
   * @throws Error de base de datos si la consulta falla.
   * @param requesterId - Parámetro `requesterId`.
   * @returns `Promise<`
   */
  private async aggregateRequesterMyTickets(requesterId: number): Promise< {
    inProgress: number;
    openPercent: number;
    openThisMonth: number;
    totalThisMonth: number;
  }> {
    const row = await this.queryRequesterAggregate(requesterId, null);
    const openThisMonth = Number(row?.open_this_month ?? 0);
    const totalThisMonth = Number(row?.total_this_month ?? 0);
    return {
      inProgress: Number(row?.in_progress ?? 0),
      openPercent: openPercent(openThisMonth, totalThisMonth),
      openThisMonth,
      totalThisMonth,
    };
  }

  /**

   * Agrega tickets resueltos y cerrados del solicitante en una sola consulta.
   * @returns Resultado de la operación.
   * @throws Error de base de datos si la consulta falla.
   * @param requesterId - Parámetro `requesterId`.
   * @returns `Promise<{ solved: TicketMetricSlice; closed: TicketMetricSlice }>`
   */
  private async aggregateRequesterSolvedClosedSlices(
    requesterId: number,
  ): Promise<{
    solved: {
      open: number;
      openPercent: number;
      openThisMonth: number;
      totalThisMonth: number;
    };
    closed: {
      open: number;
      openPercent: number;
      openThisMonth: number;
      totalThisMonth: number;
    };
  }> {
    const row = await this.queryRequesterStatusAggregate(requesterId);
    const solvedThisMonth = Number(row?.solved_this_month ?? 0);
    const closedThisMonth = Number(row?.closed_this_month ?? 0);
    const totalThisMonth = Number(row?.total_this_month ?? 0);

    return {
      solved: {
        open: Number(row?.solved_count ?? 0),
        openPercent: openPercent(solvedThisMonth, totalThisMonth),
        openThisMonth: solvedThisMonth,
        totalThisMonth,
      },
      closed: {
        open: Number(row?.closed_count ?? 0),
        openPercent: openPercent(closedThisMonth, totalThisMonth),
        openThisMonth: closedThisMonth,
        totalThisMonth,
      },
    };
  }

  /**

   * SQL de agregación por solicitante para estados resuelto y cerrado.
   * @returns Resultado de la operación.
   * @throws Error de base de datos si la consulta falla.
   * @param requesterId - Parámetro `requesterId`.
   * @returns `Promise<RequesterStatusAggregateRow | undefined>`
   */
  private async queryRequesterStatusAggregate(
    requesterId: number,
  ): Promise<RequesterStatusAggregateRow | undefined> {
    const rows = await this.mysql.query<RequesterStatusAggregateRow>(
      `SELECT
         SUM(CASE WHEN status_glpi = ${GLPI_TICKET_STATUS.SOLVED} THEN 1 ELSE 0 END) AS solved_count,
         SUM(CASE WHEN status_glpi = ${GLPI_TICKET_STATUS.CLOSED} THEN 1 ELSE 0 END) AS closed_count,
         SUM(
           CASE
             WHEN status_glpi = ${GLPI_TICKET_STATUS.SOLVED}
              AND YEAR(created_at) = YEAR(UTC_TIMESTAMP())
              AND MONTH(created_at) = MONTH(UTC_TIMESTAMP())
             THEN 1 ELSE 0
           END
         ) AS solved_this_month,
         SUM(
           CASE
             WHEN status_glpi = ${GLPI_TICKET_STATUS.CLOSED}
              AND YEAR(created_at) = YEAR(UTC_TIMESTAMP())
              AND MONTH(created_at) = MONTH(UTC_TIMESTAMP())
             THEN 1 ELSE 0
           END
         ) AS closed_this_month,
         SUM(
           CASE
             WHEN YEAR(created_at) = YEAR(UTC_TIMESTAMP())
              AND MONTH(created_at) = MONTH(UTC_TIMESTAMP())
             THEN 1 ELSE 0
           END
         ) AS total_this_month
       FROM (${BASE_TICKET_WITH_REQUESTER_SQL}) th
       WHERE is_deleted = 0
         AND requester_id = :requesterId`,
      { requesterId } as QueryValues,
    );
    return rows[0];
  }

  /**

   * Agrega incidentes o solicitudes del solicitante.
   * @returns Resultado de la operación.
   * @throws Error de base de datos si la consulta falla.
   * @param requesterId - Parámetro `requesterId`.
   * @param typeGlpi - Parámetro `typeGlpi`.
   * @returns `Promise<`
   */
  private async aggregateRequesterTypeSlice(
    requesterId: number,
    typeGlpi: number,
  ): Promise< {
    open: number;
    openPercent: number;
    openThisMonth: number;
    totalThisMonth: number;
  }> {
    const row = await this.queryRequesterAggregate(requesterId, typeGlpi);
    const openThisMonth = Number(row?.open_this_month ?? 0);
    const totalThisMonth = Number(row?.total_this_month ?? 0);
    return {
      open: Number(row?.in_progress ?? 0),
      openPercent: openPercent(openThisMonth, totalThisMonth),
      openThisMonth,
      totalThisMonth,
    };
  }

  /**

   * SQL de agregación por solicitante y tipo opcional.
   * @returns Resultado de la operación.
   * @throws Error de base de datos si la consulta falla.
   * @param requesterId - Parámetro `requesterId`.
   * @param typeGlpi - Parámetro `typeGlpi`.
   * @returns `Promise<AssignedAggregateRow | undefined>`
   */
  private async queryRequesterAggregate(
    requesterId: number,
    typeGlpi: number | null,
  ): Promise<AssignedAggregateRow | undefined>  {
    const typeClause = typeGlpi != null ? "AND type_glpi = :typeGlpi" : "";
    const params: Record<string, unknown> = { requesterId };
    if (typeGlpi != null) params.typeGlpi = typeGlpi;

    const rows = await this.mysql.query<AssignedAggregateRow>(
      `SELECT
         SUM(CASE WHEN status_glpi IN (${OPEN_STATUS_IN}) THEN 1 ELSE 0 END) AS in_progress,
         SUM(
           CASE
             WHEN status_glpi IN (${OPEN_STATUS_IN})
              AND YEAR(created_at) = YEAR(UTC_TIMESTAMP())
              AND MONTH(created_at) = MONTH(UTC_TIMESTAMP())
             THEN 1 ELSE 0
           END
         ) AS open_this_month,
         SUM(
           CASE
             WHEN YEAR(created_at) = YEAR(UTC_TIMESTAMP())
              AND MONTH(created_at) = MONTH(UTC_TIMESTAMP())
             THEN 1 ELSE 0
           END
         ) AS total_this_month
       FROM (${BASE_TICKET_WITH_REQUESTER_SQL}) th
       WHERE is_deleted = 0
         AND requester_id = :requesterId
         ${typeClause}`,
      params as QueryValues,
    );
    return rows[0];
  }

  /**

   * Agrega tickets abiertos del solicitante en una sede.
   * @returns Resultado de la operación.
   * @throws Error de base de datos si la consulta falla.
   * @param requesterId - Parámetro `requesterId`.
   * @param locationId - Parámetro `locationId`.
   * @returns `Promise<`
   */
  private async aggregateRequesterSiteSlice(
    requesterId: number,
    locationId: number,
  ): Promise< {
    open: number;
    openPercent: number;
    openThisMonth: number;
    totalThisMonth: number;
  }> {
    const rows = await this.mysql.query<SiteAggregateRow>(
      `SELECT
         COUNT(*) AS open_count,
         SUM(
           CASE
             WHEN status_glpi IN (${OPEN_STATUS_IN})
              AND YEAR(created_at) = YEAR(UTC_TIMESTAMP())
              AND MONTH(created_at) = MONTH(UTC_TIMESTAMP())
             THEN 1 ELSE 0
           END
         ) AS open_this_month,
         SUM(
           CASE
             WHEN YEAR(created_at) = YEAR(UTC_TIMESTAMP())
              AND MONTH(created_at) = MONTH(UTC_TIMESTAMP())
             THEN 1 ELSE 0
           END
         ) AS total_this_month
       FROM (
         SELECT status_glpi, created_at
         FROM (${BASE_TICKET_WITH_REQUESTER_SQL}) th
         WHERE is_deleted = 0
           AND requester_id = :requesterId
           AND location_id = :locationId
           AND status_glpi IN (${OPEN_STATUS_IN})
         LIMIT ${METRICS_SITE_LIMIT}
       ) site_pool`,
      { requesterId, locationId } as QueryValues,
    );

    const row = rows[0];
    const open = Number(row?.open_count ?? 0);
    const openThisMonth = Number(row?.open_this_month ?? 0);
    const totalThisMonth = Number(row?.total_this_month ?? 0);

    return {
      open,
      openPercent: openPercent(openThisMonth, totalThisMonth),
      openThisMonth,
      totalThisMonth,
    };
  }

  /**
 Tickets abiertos del solicitante agrupados por sede.
   * @param requesterId - Parámetro `requesterId`.
   * @returns `Promise<GlobalOpenByLocationRow[]>`
   * @throws No lanza excepciones salvo errores de infraestructura.
   */
  private async listRequesterOpenByLocation(
    requesterId: number,
  ): Promise<GlobalOpenByLocationRow[]>  {
    return this.mysql.query<GlobalOpenByLocationRow>(
      `SELECT
         th.location_id,
         COALESCE(NULLIF(TRIM(loc.completename), ''), loc.name) AS name,
         COUNT(*) AS open_count
       FROM (${BASE_TICKET_WITH_REQUESTER_SQL}) th
       INNER JOIN glpi_locations loc ON loc.id = th.location_id
       WHERE th.is_deleted = 0
         AND th.requester_id = :requesterId
         AND th.status_glpi IN (${OPEN_STATUS_IN})
         AND th.location_id IS NOT NULL
         AND th.location_id > 0
       GROUP BY th.location_id, name
       ORDER BY open_count DESC, name ASC`,
      { requesterId } as QueryValues,
    );
  }

  /**

   * Total global de tickets abiertos por sede.
   * @returns Resultado de la operación.
   * @throws Error de base de datos si la consulta falla.
   * @returns `Promise<GlobalOpenByLocationRow[]>`
   */
  private async listGlobalOpenByLocation(): Promise<GlobalOpenByLocationRow[]>  {
    return this.mysql.query<GlobalOpenByLocationRow>(
      `SELECT
         loc.id AS location_id,
         COALESCE(NULLIF(TRIM(loc.completename), ''), loc.name) AS name,
         open_counts.open_count AS open_count
       FROM glpi_locations loc
       INNER JOIN (
         SELECT
           t.locations_id AS location_id,
           COUNT(*) AS open_count
         FROM glpi_tickets t
         WHERE t.is_deleted = 0
           AND t.status IN (${OPEN_STATUS_IN})
           AND t.locations_id IS NOT NULL
           AND t.locations_id > 0
         GROUP BY t.locations_id
       ) open_counts ON open_counts.location_id = loc.id
       ORDER BY open_count DESC, name ASC`,
    );
  }
}
