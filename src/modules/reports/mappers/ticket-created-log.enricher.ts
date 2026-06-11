/**
 * @file ticket-created-log.enricher.ts
 * @description Enriquecimiento de filas del reporte ticket.created con sede del solicitante GLPI.
 */
import type { PaginatedResult } from "../../../common/dto/pagination.dto";
import type { DomainLocation } from "../../glpi/mappers/location.mapper";
import type { DomainUser } from "../../glpi/mappers/user.mapper";
import { normalizeEmail } from "../../glpi/user-search.utils";
import { normalizeLocationId } from "../../tickets/domain/ticket-metrics.helpers";
import type {
  TicketCreatedLogSortBy,
  TicketCreatedLogSortOrder,
} from "../dto/list-ticket-created-logs-query.dto";
import type { TicketCreatedLogRow } from "../reports.types";

/** Sede resuelta para un solicitante. */
export interface RequesterLocationInfo {
  locationId: number | null;
  locationName: string | null;
}

/**
 * Construye mapa email normalizado → sede del usuario GLPI.
 * @param users - Usuarios activos cacheados.
 * @param locations - Catálogo de sedes GLPI.
 * @returns Mapa por email normalizado.
 */
export function buildRequesterLocationByEmail(
  users: DomainUser[],
  locations: DomainLocation[],
): Map<string, RequesterLocationInfo> {
  const locationById = new Map(
    locations.map((location) => [
      location.id,
      location.fullPath?.trim() || location.name?.trim() || null,
    ]),
  );
  const map = new Map<string, RequesterLocationInfo>();

  for (const user of users) {
    const email = user.email?.trim();
    if (!email) continue;

    const locationId = normalizeLocationId(user.locationId);
    const locationName = locationId ? (locationById.get(locationId) ?? null) : null;
    map.set(normalizeEmail(email), { locationId, locationName });
  }

  return map;
}

/**
 * Resuelve la sede de un email de solicitante.
 * @param email - Correo del solicitante.
 * @param locationByEmail - Mapa precalculado.
 * @returns Sede resuelta o vacía.
 */
function resolveRequesterLocation(
  email: string | null,
  locationByEmail: Map<string, RequesterLocationInfo>,
): RequesterLocationInfo {
  const trimmed = email?.trim();
  if (!trimmed) {
    return { locationId: null, locationName: null };
  }

  return locationByEmail.get(normalizeEmail(trimmed)) ?? { locationId: null, locationName: null };
}

/**
 * Añade sede del solicitante a cada fila del reporte.
 * @param rows - Filas crudas de Postgres.
 * @param locationByEmail - Mapa email → sede.
 * @returns Filas enriquecidas.
 */
export function enrichTicketCreatedLogRows(
  rows: TicketCreatedLogRow[],
  locationByEmail: Map<string, RequesterLocationInfo>,
): TicketCreatedLogRow[] {
  return rows.map((row) => {
    const resolved = resolveRequesterLocation(row.requester_email, locationByEmail);
    return {
      ...row,
      requester_location_id: resolved.locationId,
      requester_location: resolved.locationName,
    };
  });
}

/**
 * Filtra filas por sede del solicitante.
 * @param rows - Filas enriquecidas.
 * @param locationId - ID de sede GLPI.
 * @returns Filas cuya sede coincide.
 */
export function filterRowsByLocationId(
  rows: TicketCreatedLogRow[],
  locationId: number,
): TicketCreatedLogRow[] {
  const normalized = normalizeLocationId(locationId);
  if (!normalized) return rows;

  return rows.filter((row) => row.requester_location_id === normalized);
}

/**
 * @param value - Fecha o texto. @returns Timestamp para ordenación.
 */
function toSortableTimestamp(value: Date | string | null | undefined): number {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * @param value - Texto nullable. @returns Valor comparable en minúsculas.
 */
function toSortableText(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/**
 * Ordena filas enriquecidas por columna permitida.
 * @param rows - Filas a ordenar.
 * @param sortBy - Columna de ordenación.
 * @param sortOrder - Dirección asc/desc.
 * @returns Filas ordenadas (nueva copia).
 */
export function sortEnrichedRows(
  rows: TicketCreatedLogRow[],
  sortBy?: TicketCreatedLogSortBy,
  sortOrder?: TicketCreatedLogSortOrder,
): TicketCreatedLogRow[] {
  const direction = sortOrder === "asc" ? 1 : -1;
  const sorted = [...rows];

  const compareText = (
    left: string | null | undefined,
    right: string | null | undefined,
  ): number => toSortableText(left).localeCompare(toSortableText(right), "es");

  sorted.sort((left, right) => {
    let result = 0;

    switch (sortBy) {
      case "company":
        result = compareText(left.company, right.company);
        break;
      case "subject":
        result = compareText(left.subject, right.subject);
        break;
      case "fromAddress":
        result = compareText(left.from_address, right.from_address);
        break;
      case "requesterEmail":
        result = compareText(left.requester_email, right.requester_email);
        break;
      case "requesterLocation":
        result = compareText(left.requester_location, right.requester_location);
        break;
      case "type":
        result = compareText(left.type, right.type);
        break;
      case "category":
        result = compareText(left.category, right.category);
        break;
      case "mailSent":
        result = compareText(left.mail_sent, right.mail_sent);
        break;
      case "httpStatus":
        result = compareText(left.http_status, right.http_status);
        break;
      case "createdAt":
      default:
        result =
          toSortableTimestamp(left.created_at) - toSortableTimestamp(right.created_at);
        break;
    }

    if (result === 0) {
      result =
        toSortableTimestamp(left.created_at) - toSortableTimestamp(right.created_at);
    }

    return result * direction;
  });

  return sorted;
}

/**
 * Pagina un arreglo de filas en memoria.
 * @param rows - Filas completas.
 * @param page - Página 1-based.
 * @param limit - Tamaño de página.
 * @returns Resultado paginado.
 */
export function paginateRows(
  rows: TicketCreatedLogRow[],
  page: number,
  limit: number,
): PaginatedResult<TicketCreatedLogRow> {
  const safePage = Math.max(1, page);
  const safeLimit = Math.max(1, limit);
  const offset = (safePage - 1) * safeLimit;

  return {
    items: rows.slice(offset, offset + safeLimit),
    total: rows.length,
    page: safePage,
    limit: safeLimit,
  };
}
