import type { GlpiLocationRaw } from "../glpi.types";

export interface DomainLocation {
  id: number;
  name: string;
  fullPath: string;
  building: string | null;
  room: string | null;
}

export class LocationMapper {
  static toDomain(raw: GlpiLocationRaw): DomainLocation {
    return {
      id: raw.id,
      name: raw.name,
      fullPath: raw.completename ?? raw.name,
      building: raw.building?.trim() || null,
      room: raw.room?.trim() || null,
    };
  }
}
