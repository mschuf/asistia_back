import { Injectable } from "@nestjs/common";
import type { QueryValues } from "mysql2";
import type { RowDataPacket } from "mysql2/promise";
import { GLPI_TICKET_TYPE } from "../glpi.constants";
import { MysqlService } from "../../mysql/mysql.service";
import { OPEN_STATUS_GLPI, openPercent } from "../../tickets/domain/ticket-metrics.helpers";
import type { TicketMetricsResponseDto } from "../../tickets/dto/ticket-metrics.response.dto";

const METRICS_SITE_LIMIT = 50000;
const OPEN_STATUS_IN = OPEN_STATUS_GLPI.join(", ");
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

interface GlobalOpenByLocationRow extends RowDataPacket {
  location_id: number;
  name: string | null;
  open_count: number | string;
}

export interface MetricsForTechnicianInput {
  technicianId: number;
  locationId: number | null | undefined;
}

@Injectable()
export class TicketsMetricsSqlRepository {
  constructor(private readonly mysql: MysqlService) {}

  async getMetricsForTechnician(
    input: MetricsForTechnicianInput,
  ): Promise<TicketMetricsResponseDto> {
    const technicianId = input.technicianId;
    const [myTickets, myIncidents, myRequests, mySite, openByLocationRows] = await Promise.all([
      this.aggregateMyTickets(technicianId),
      this.aggregateTypeSlice(technicianId, GLPI_TICKET_TYPE.INCIDENT),
      this.aggregateTypeSlice(technicianId, GLPI_TICKET_TYPE.REQUEST),
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
      openByLocation,
    };
  }

  private async aggregateMyTickets(technicianId: number): Promise<{
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

  private async aggregateTypeSlice(
    technicianId: number,
    typeGlpi: number,
  ): Promise<{
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

  private async queryAssignedAggregate(
    technicianId: number,
    typeGlpi: number | null,
  ): Promise<AssignedAggregateRow | undefined> {
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

  private async aggregateSiteSlice(
    locationId: number,
  ): Promise<{
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

  /** Total global de tickets abiertos por sede (Indicadores; sin filtro por técnico). */
  private async listGlobalOpenByLocation(): Promise<GlobalOpenByLocationRow[]> {
    return this.mysql.query<GlobalOpenByLocationRow>(
      `SELECT
         loc.id AS location_id,
         COALESCE(NULLIF(TRIM(loc.completename), ''), loc.name) AS name,
         COALESCE(open_counts.open_count, 0) AS open_count
       FROM glpi_locations loc
       LEFT JOIN (
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
