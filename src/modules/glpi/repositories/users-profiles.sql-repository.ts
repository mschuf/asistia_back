/**
 * @file users-profiles.sql-repository.ts
 * @description Consulta perfiles GLPI por usuario y entidad vía MySQL.
 */
import { Injectable } from "@nestjs/common";
import type { RowDataPacket } from "mysql2";
import { isSuperAdminProfileName } from "../role.utils";
import { MysqlService } from "../../mysql/mysql.service";

interface SqlUserProfileRow extends RowDataPacket {
  entity_id: number | null;
  profile_name: string;
}

export interface UserEntityProfile {
  entityId: number;
  profileName: string;
}

/**
 * Repositorio SQL de perfiles de usuario en GLPI.
 */
@Injectable()
export class UsersProfilesSqlRepository {
  /** Inyecta el servicio MySQL compartido. */
  constructor(private readonly mysql: MysqlService) {}

  /**
   * Lista perfiles GLPI asignados a un usuario por entidad.
   * @param userId - ID del usuario GLPI.
   * @returns Pares entidad/perfil válidos.
   * @throws Error de base de datos si la consulta falla.
   */
  async listUserEntityProfiles(userId: number): Promise<UserEntityProfile[]> {
    const rows = await this.mysql.query<SqlUserProfileRow>(
      `SELECT
          pu.entities_id AS entity_id,
          p.name AS profile_name
       FROM glpi_profiles_users pu
       INNER JOIN glpi_profiles p
         ON p.id = pu.profiles_id
       WHERE pu.users_id = :userId`,
      { userId },
    );

    return rows
      .map((row) => {
        const profileName = row.profile_name?.trim();
        const entityId = Number(row.entity_id);

        if (!profileName || !Number.isFinite(entityId) || entityId < 0) {
          return null;
        }

        return { entityId, profileName } satisfies UserEntityProfile;
      })
      .filter((row): row is UserEntityProfile => row !== null);
  }

  /**
   * Indica si el usuario tiene perfil super-admin en alguna entidad.
   * @param userId - ID del usuario GLPI.
   * @returns `true` si algún perfil coincide con super-admin.
   * @throws Error de base de datos si la consulta falla.
   */
  async isSuperAdminUser(userId: number): Promise<boolean> {
    const profiles = await this.listUserEntityProfiles(userId);
    return profiles.some((profile) => isSuperAdminProfileName(profile.profileName));
  }
}
