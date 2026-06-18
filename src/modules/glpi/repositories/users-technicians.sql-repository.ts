/**
 * @file users-technicians.sql-repository.ts
 * @description Consulta usuarios activos y técnicos elegibles desde MySQL de GLPI.
 */
import { Injectable } from "@nestjs/common";
import type { QueryValues, RowDataPacket } from "mysql2";
import { OPERATIONAL_IT_PROFILE_KEYWORDS } from "../role.utils";
import { MysqlService } from "../../mysql/mysql.service";
import type { DomainUser } from "../mappers/user.mapper";
import { sortUsersByName } from "../user-search.utils";

interface SqlUserRow extends RowDataPacket {
  id: number;
  name: string;
  firstname: string | null;
  realname: string | null;
  default_email: string | null;
  phone: string | null;
  mobile: string | null;
  locations_id: number | null;
  groups_id: number | null;
  entities_id: number | null;
  user_title: string | null;
  is_active: number;
  is_deleted: number;
}

/**
 * Repositorio SQL de usuarios y técnicos elegibles en GLPI.
 */
@Injectable()
export class UsersTechniciansSqlRepository {
  /** Inyecta el servicio MySQL compartido. */
  constructor(private readonly mysql: MysqlService) {}

  /**
   * Busca un usuario por ID en MySQL (activo o inactivo).
   * @param id - ID de usuario GLPI.
   * @returns Usuario de dominio o `null` si no existe.
   * @throws Error de base de datos si la consulta falla.
   */
  async findById(id: number): Promise<DomainUser | null> {
    const rows = await this.mysql.query<SqlUserRow>(
      `SELECT
          u.id,
          u.name,
          u.firstname,
          u.realname,
          ue.email AS default_email,
          u.phone,
          u.mobile,
          u.locations_id,
          u.groups_id,
          u.entities_id,
          ut.name AS user_title,
          u.is_active,
          COALESCE(u.is_deleted, 0) AS is_deleted
       FROM glpi_users u
       LEFT JOIN glpi_useremails ue
         ON ue.users_id = u.id AND ue.is_default = 1
       LEFT JOIN glpi_usertitles ut
         ON ut.id = u.usertitles_id
       WHERE u.id = :id
       LIMIT 1`,
      { id } as QueryValues,
    );

    const row = rows[0];
    return row ? this.toDomainUser(row) : null;
  }

  /**
   * Lista todos los usuarios activos no eliminados.
   * @returns Usuarios de dominio ordenados por nombre.
   * @throws Error de base de datos si la consulta falla.
   */
  async listActiveUsers(): Promise<DomainUser[]> {
    const rows = await this.mysql.query<SqlUserRow>(
      `SELECT DISTINCT
          u.id,
          u.name,
          u.firstname,
          u.realname,
          ue.email AS default_email,
          u.phone,
          u.mobile,
          u.locations_id,
          u.groups_id,
          u.entities_id,
          ut.name AS user_title,
          u.is_active,
          COALESCE(u.is_deleted, 0) AS is_deleted
       FROM glpi_users u
       LEFT JOIN glpi_useremails ue
         ON ue.users_id = u.id AND ue.is_default = 1
       LEFT JOIN glpi_usertitles ut
         ON ut.id = u.usertitles_id
       WHERE u.is_active = 1
         AND COALESCE(u.is_deleted, 0) = 0`,
    );

    return sortUsersByName(rows.map((row) => this.toDomainUser(row)));
  }

  /**
   * Lista técnicos elegibles según grupos TI y perfiles operativos.
   * @param tiGroupIds - IDs de grupos de soporte/TI.
   * @returns Técnicos elegibles ordenados por nombre.
   * @throws Error de base de datos si la consulta falla.
   */
  async listEligibleTechnicians(tiGroupIds: number[]): Promise<DomainUser[]> {
    return this.queryEligibleTechnicians(tiGroupIds);
  }

  /**
   * Lista técnicos elegibles opcionalmente filtrados por sede.
   * @param tiGroupIds - IDs de grupos de soporte/TI.
   * @param locationId - ID de sede GLPI opcional.
   * @returns Técnicos elegibles en la sede indicada.
   * @throws Error de base de datos si la consulta falla.
   */
  async listEligibleTechniciansForLocation(
    tiGroupIds: number[],
    locationId?: number | null,
  ): Promise<DomainUser[]> {
    return this.queryEligibleTechnicians(tiGroupIds, locationId);
  }

  /**
   * Ejecuta la consulta SQL de técnicos elegibles con filtros dinámicos.
   * @param tiGroupIds - IDs de grupos TI.
   * @param locationId - Sede opcional para filtrar.
   * @returns Usuarios técnicos elegibles.
   * @throws Error de base de datos si la consulta falla.
   */
  private async queryEligibleTechnicians(
    tiGroupIds: number[],
    locationId?: number | null,
  ): Promise<DomainUser[]> {
    const groupPlaceholders = tiGroupIds.map((_, index) => `:group_${index}`).join(", ");
    const profileLikeClauses = OPERATIONAL_IT_PROFILE_KEYWORDS.map(
      (_, index) => `LOWER(COALESCE(p.name, '')) LIKE :profile_${index}`,
    ).join(" OR ");

    const groupWhere =
      tiGroupIds.length > 0
        ? `(u.groups_id IN (${groupPlaceholders}) OR gu.groups_id IN (${groupPlaceholders}))`
        : "1 = 0";

    const normalizedLocationId =
      locationId != null && Number.isFinite(Number(locationId)) && Number(locationId) > 0
        ? Number(locationId)
        : null;
    const locationFilter = normalizedLocationId != null ? "AND u.locations_id = :locationId" : "";
    const params = this.buildParams(tiGroupIds) as QueryValues;
    if (normalizedLocationId != null) {
      (params as Record<string, number>).locationId = normalizedLocationId;
    }

    const rows = await this.mysql.query<SqlUserRow>(
      `SELECT DISTINCT
          u.id,
          u.name,
          u.firstname,
          u.realname,
          ue.email AS default_email,
          u.phone,
          u.mobile,
          u.locations_id,
          u.groups_id,
          u.entities_id,
          ut.name AS user_title,
          u.is_active,
          COALESCE(u.is_deleted, 0) AS is_deleted
       FROM glpi_users u
       LEFT JOIN glpi_useremails ue
         ON ue.users_id = u.id AND ue.is_default = 1
       LEFT JOIN glpi_usertitles ut
         ON ut.id = u.usertitles_id
       LEFT JOIN glpi_groups_users gu
         ON gu.users_id = u.id
       LEFT JOIN glpi_profiles_users pu
         ON pu.users_id = u.id
       LEFT JOIN glpi_profiles p
         ON p.id = pu.profiles_id
       WHERE u.is_active = 1
         AND COALESCE(u.is_deleted, 0) = 0
         AND (COALESCE(u.groups_id, 0) > 0 OR COALESCE(gu.groups_id, 0) > 0)
         AND (${groupWhere} OR (${profileLikeClauses}))
         ${locationFilter}`,
      params,
    );

    return sortUsersByName(rows.map((row) => this.toDomainUser(row)));
  }

  /**
   * Construye parámetros nombrados para grupos y perfiles en la consulta.
   * @param tiGroupIds - IDs de grupos TI.
   * @returns Mapa de placeholders SQL.
   * @throws No lanza excepciones.
   */
  private buildParams(tiGroupIds: number[]): Record<string, number | string> {
    const params: Record<string, number | string> = {};
    tiGroupIds.forEach((groupId, index) => {
      params[`group_${index}`] = groupId;
    });
    OPERATIONAL_IT_PROFILE_KEYWORDS.forEach((keyword, index) => {
      params[`profile_${index}`] = `%${keyword.toLowerCase()}%`;
    });
    return params;
  }

  /**
   * Normaliza valor desconocido a cadena opcional.
   * @param value - Valor de columna SQL.
   * @returns Texto recortado o `null`.
   * @throws No lanza excepciones.
   */
  private toOptionalString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
  }

  /**
   * Normaliza valor a número positivo opcional.
   * @param value - Valor de columna SQL.
   * @returns Entero positivo o `null`.
   * @throws No lanza excepciones.
   */
  private toOptionalPositiveNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  /**
   * Normaliza y valida correo electrónico.
   * @param value - Valor de columna SQL.
   * @returns Correo con `@` o `null`.
   * @throws No lanza excepciones.
   */
  private toOptionalEmail(value: unknown): string | null {
    const email = this.toOptionalString(value);
    if (!email || !email.includes("@")) return null;
    return email;
  }

  /**
   * Mapea fila SQL a `DomainUser`.
   * @param row - Fila de `glpi_users`.
   * @returns Usuario de dominio.
   * @throws No lanza excepciones.
   */
  private toDomainUser(row: SqlUserRow): DomainUser {
    const firstName = this.toOptionalString(row.firstname);
    const lastName = this.toOptionalString(row.realname);
    const composed = [firstName, lastName].filter(Boolean).join(" ").trim();
    const fullName = composed.length > 0 ? composed : row.name;

    return {
      id: Number(row.id),
      login: String(row.name),
      firstName,
      lastName,
      fullName,
      email: this.toOptionalEmail(row.default_email),
      phone: this.toOptionalString(row.phone),
      mobile: this.toOptionalString(row.mobile),
      locationId: this.toOptionalPositiveNumber(row.locations_id),
      primaryGroupId: this.toOptionalPositiveNumber(row.groups_id),
      entityId: this.toOptionalPositiveNumber(row.entities_id),
      userTitle: this.toOptionalString(row.user_title),
      isActive: Number(row.is_active) === 1 && Number(row.is_deleted) !== 1,
    } satisfies DomainUser;
  }
}
