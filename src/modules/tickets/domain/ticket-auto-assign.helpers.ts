/**
 * @file ticket-auto-assign.helpers.ts
 * @description Helpers para elegir el técnico activo más reciente por sede o globalmente.
 */
import type { DomainUser } from "../../glpi/mappers/user.mapper";
import { sortUsersByName } from "../../glpi/user-search.utils";
import { normalizeLocationId } from "./ticket-metrics.helpers";

/**
 * Selecciona el último técnico activo ordenado alfabéticamente por nombre.
 * @param technicians - Lista de usuarios técnicos candidatos.
 * @param locationId - ID de sede para filtrar; si es nulo, busca a nivel global.
 * @returns Técnico elegido o `null` si no hay candidatos activos.
 * @throws Ninguno.
 */
export function pickLastActiveTechnicianByName(
  technicians: DomainUser[],
  locationId?: number | null,
): DomainUser | null {
  const normalizedLocationId = normalizeLocationId(locationId);
  let pool = technicians.filter((technician) => technician.isActive);

  if (normalizedLocationId != null) {
    pool = pool.filter(
      (technician) => normalizeLocationId(technician.locationId) === normalizedLocationId,
    );
  }

  if (pool.length === 0) {
    return null;
  }

  const sorted = sortUsersByName(pool);
  return sorted[sorted.length - 1] ?? null;
}
