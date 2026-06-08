import type { DomainUser } from "../../glpi/mappers/user.mapper";
import { sortUsersByName } from "../../glpi/user-search.utils";
import { normalizeLocationId } from "./ticket-metrics.helpers";

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
