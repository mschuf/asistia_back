import type { GlpiItilCategoryRaw } from "../glpi.types";

export interface DomainCategory {
  id: number;
  name: string;
  fullPath: string;
  parentId: number | null;
  level: number;
}

export class CategoryMapper {
  static toDomain(raw: GlpiItilCategoryRaw): DomainCategory {
    return {
      id: raw.id,
      name: raw.name,
      fullPath: raw.completename ?? raw.name,
      parentId: raw.itilcategories_id ?? null,
      level: raw.level ?? 0,
    };
  }
}
