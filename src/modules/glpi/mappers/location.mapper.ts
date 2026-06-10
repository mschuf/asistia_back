/**
 * @file location.mapper.ts
 * @description Mapea sedes (locations) de GLPI al modelo de dominio.
 */
import type { GlpiLocationRaw } from "../glpi.types";

export interface DomainLocation {
  id: number;
  name: string;
  fullPath: string;
  building: string | null;
  room: string | null;
}

/**
 * Convierte sedes GLPI a objetos de dominio.
 */
export class LocationMapper {
  /**
   * Transforma una sede GLPI en su representación de dominio.
   * @param raw - Registro crudo devuelto por la API de GLPI.
   * @returns Sede normalizada para la capa de aplicación.
   * @throws No lanza excepciones.
   */
  static toDomain(raw: GlpiLocationRaw): DomainLocation {
    return {
      id: LocationMapper.toId(raw.id),
      name: raw.name,
      fullPath: raw.completename ?? raw.name,
      building: raw.building?.trim() || null,
      room: raw.room?.trim() || null,
    };
  }

  /**
   * Convierte un valor desconocido en ID opcional positivo.
   * GLPI REST suele devolver IDs numéricos como string en JSON.
   * @param value - Valor crudo del ID.
   * @returns ID positivo o `null`.
   * @throws No lanza excepciones.
   */
  private static toOptionalId(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const id = Number(value);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  /**
   * Convierte un valor desconocido en ID numérico (0 si no es válido).
   * @param value - Valor crudo del ID.
   * @returns ID positivo o `0`.
   * @throws No lanza excepciones.
   */
  private static toId(value: unknown): number {
    return LocationMapper.toOptionalId(value) ?? 0;
  }
}
