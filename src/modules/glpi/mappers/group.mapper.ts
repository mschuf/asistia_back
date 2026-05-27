import type { GlpiGroupRaw } from "../glpi.types";

export interface DomainGroup {
  id: number;
  name: string;
  fullPath: string;
  description: string | null;
}

export class GroupMapper {
  static toDomain(raw: GlpiGroupRaw): DomainGroup {
    return {
      id: raw.id,
      name: raw.name,
      fullPath: raw.completename ?? raw.name,
      description: raw.comment?.trim() || null,
    };
  }
}
