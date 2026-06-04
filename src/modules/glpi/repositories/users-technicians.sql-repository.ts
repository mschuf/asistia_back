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
  is_active: number;
  is_deleted: number;
}

@Injectable()
export class UsersTechniciansSqlRepository {
  constructor(private readonly mysql: MysqlService) {}

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
          u.is_active,
          COALESCE(u.is_deleted, 0) AS is_deleted
       FROM glpi_users u
       LEFT JOIN glpi_useremails ue
         ON ue.users_id = u.id AND ue.is_default = 1
       WHERE u.is_active = 1
         AND COALESCE(u.is_deleted, 0) = 0`,
    );

    return sortUsersByName(rows.map((row) => this.toDomainUser(row)));
  }

  async listEligibleTechnicians(tiGroupIds: number[]): Promise<DomainUser[]> {
    const groupPlaceholders = tiGroupIds.map((_, index) => `:group_${index}`).join(", ");
    const profileLikeClauses = OPERATIONAL_IT_PROFILE_KEYWORDS.map(
      (_, index) => `LOWER(COALESCE(p.name, '')) LIKE :profile_${index}`,
    ).join(" OR ");

    const groupWhere =
      tiGroupIds.length > 0
        ? `(u.groups_id IN (${groupPlaceholders}) OR gu.groups_id IN (${groupPlaceholders}))`
        : "1 = 0";

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
          u.is_active,
          COALESCE(u.is_deleted, 0) AS is_deleted
       FROM glpi_users u
       LEFT JOIN glpi_useremails ue
         ON ue.users_id = u.id AND ue.is_default = 1
       LEFT JOIN glpi_groups_users gu
         ON gu.users_id = u.id
       LEFT JOIN glpi_profiles_users pu
         ON pu.users_id = u.id
       LEFT JOIN glpi_profiles p
         ON p.id = pu.profiles_id
       WHERE u.is_active = 1
         AND COALESCE(u.is_deleted, 0) = 0
         AND (${groupWhere} OR (${profileLikeClauses}))`,
      this.buildParams(tiGroupIds) as QueryValues,
    );

    return sortUsersByName(rows.map((row) => this.toDomainUser(row)));
  }

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

  private toOptionalString(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
  }

  private toOptionalPositiveNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private toOptionalEmail(value: unknown): string | null {
    const email = this.toOptionalString(value);
    if (!email || !email.includes("@")) return null;
    return email;
  }

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
      isActive: Number(row.is_active) === 1 && Number(row.is_deleted) !== 1,
    } satisfies DomainUser;
  }
}
