/**
 * @file group.mapper.ts
 * @description Mapea registros crudos de grupos GLPI al modelo de dominio.
 */
import type { GlpiGroupRaw } from "../glpi.types";

export interface DomainGroup {
  id: number;
  name: string;
  fullPath: string;
  description: string | null;
}

/**
 * Convierte filas de grupo GLPI a objetos de dominio.
 */
export class GroupMapper {
  /**
   * Transforma un grupo GLPI en su representación de dominio.
   * @param raw - Registro crudo devuelto por la API de GLPI.
   * @returns Grupo normalizado para la capa de aplicación.
   * @throws No lanza excepciones.
   */
  static toDomain(raw: GlpiGroupRaw): DomainGroup {
    return {
      id: raw.id,
      name: raw.name,
      fullPath: raw.completename ?? raw.name,
      description: raw.comment?.trim() || null,
    };
  }
}
