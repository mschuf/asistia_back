/**
 * @file user.mapper.ts
 * @description Mapea usuarios de GLPI al modelo de dominio de Asistia.
 */
import type { GlpiUserRaw } from "../glpi.types";

export interface DomainUser {
  id: number;
  login: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  locationId: number | null;
  primaryGroupId: number | null;
  entityId: number | null;
  isActive: boolean;
}

/**
 * Convierte un valor desconocido en cadena opcional no vacía.
 * @param value - Valor a normalizar.
 * @returns Texto recortado o `null`.
 * @throws No lanza excepciones.
 */
function toOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

/**
 * Convierte registros de usuario GLPI a objetos de dominio.
 */
export class UserMapper {
  /**
   * Transforma un usuario GLPI en su representación de dominio.
   * @param raw - Registro crudo devuelto por la API de GLPI.
   * @returns Usuario normalizado con nombre completo y estado activo.
   * @throws No lanza excepciones.
   */
  static toDomain(raw: GlpiUserRaw): DomainUser {
    const firstName = toOptionalString(raw.firstname);
    const lastName = toOptionalString(raw.realname);
    const composed = [firstName, lastName].filter(Boolean).join(" ").trim();
    const fullName = composed.length > 0 ? composed : raw.name;

    const email = UserMapper.extractEmail(raw);

    return {
      id: raw.id,
      login: raw.name,
      firstName,
      lastName,
      fullName,
      email,
      phone: toOptionalString(raw.phone),
      mobile: toOptionalString(raw.mobile),
      locationId: UserMapper.toOptionalId(raw.locations_id),
      primaryGroupId: raw.groups_id ?? null,
      entityId: raw.entities_id ?? null,
      isActive: raw.is_active !== 0 && raw.is_deleted !== 1,
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
   * Extrae el correo principal del usuario desde campos embebidos de GLPI.
   * @param raw - Registro crudo del usuario.
   * @returns Correo válido o `null`.
   * @throws No lanza excepciones.
   */
  private static extractEmail(raw: GlpiUserRaw): string | null {
    if (raw.default_email) return String(raw.default_email);
    const emails = raw._useremails;
    if (!emails) return null;
    if (Array.isArray(emails)) {
      for (const entry of emails) {
        if (typeof entry === "string" && entry.includes("@")) return entry;
        if (entry && typeof entry === "object" && typeof entry.email === "string" && entry.email.includes("@")) {
          return entry.email;
        }
      }
    }
    return null;
  }
}
