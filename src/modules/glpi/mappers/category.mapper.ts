/**
 * @file category.mapper.ts
 * @description Mapea categorías ITIL de GLPI al modelo de dominio.
 */
import type { GlpiItilCategoryRaw } from "../glpi.types";

export interface DomainCategory {
  id: number;
  name: string;
  fullPath: string;
  parentId: number | null;
  level: number;
}

/**
 * Convierte categorías ITIL GLPI a objetos de dominio.
 */
export class CategoryMapper {
  /**
   * Transforma una categoría ITIL en su representación de dominio.
   * @param raw - Registro crudo devuelto por la API de GLPI.
   * @returns Categoría normalizada para la capa de aplicación.
   * @throws No lanza excepciones.
   */
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
