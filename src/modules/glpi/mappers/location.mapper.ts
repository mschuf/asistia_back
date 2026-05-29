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
      id: LocationMapper.toId(raw.id),
      name: raw.name,
      fullPath: raw.completename ?? raw.name,
      building: raw.building?.trim() || null,
      room: raw.room?.trim() || null,
    };
  }

  /** GLPI REST suele devolver IDs numéricos como string en JSON. */
  private static toOptionalId(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  private static toId(value: unknown): number {
    return LocationMapper.toOptionalId(value) ?? 0;
  }
}
