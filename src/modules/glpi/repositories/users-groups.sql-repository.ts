/**
 * @file users-groups.sql-repository.ts
 * @description Consulta membresías de grupos GLPI por usuario vía MySQL.
 */
import { Injectable } from "@nestjs/common";
import type { RowDataPacket } from "mysql2";
import { isPorteriaGroupName } from "../role.utils";
import { MysqlService } from "../../mysql/mysql.service";

interface SqlUserGroupRow extends RowDataPacket {
  group_name: string;
}

/**
 * Repositorio SQL de grupos de usuario en GLPI.
 */
@Injectable()
export class UsersGroupsSqlRepository {
  /** Inyecta el servicio MySQL compartido. */
  constructor(private readonly mysql: MysqlService) {}

  /**
   * Lista los nombres de grupos GLPI asignados a un usuario.
   * @param userId - ID del usuario GLPI.
   * @returns Nombres de grupo no vacíos.
   * @throws Error de base de datos si la consulta falla.
   */
  async listUserGroupNames(userId: number): Promise<string[]> {
    const rows = await this.mysql.query<SqlUserGroupRow>(
      `SELECT g.name AS group_name
       FROM glpi_groups_users gu
       INNER JOIN glpi_groups g
         ON g.id = gu.groups_id
       WHERE gu.users_id = :userId`,
      { userId },
    );

    return rows
      .map((row) => row.group_name?.trim())
      .filter((name): name is string => Boolean(name));
  }

  /**
   * Indica si el usuario pertenece al grupo GLPI de portería.
   * @param userId - ID del usuario GLPI.
   * @returns `true` si algún grupo coincide con la nomenclatura de portería.
   * @throws Error de base de datos si la consulta falla.
   */
  async isPorteriaUser(userId: number): Promise<boolean> {
    const groupNames = await this.listUserGroupNames(userId);
    return groupNames.some((name) => isPorteriaGroupName(name));
  }
}
