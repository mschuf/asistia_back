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

@Injectable()
export class UsersProfilesSqlRepository {
  constructor(private readonly mysql: MysqlService) {}

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

  async isSuperAdminUser(userId: number): Promise<boolean> {
    const profiles = await this.listUserEntityProfiles(userId);
    return profiles.some((profile) => isSuperAdminProfileName(profile.profileName));
  }
}
