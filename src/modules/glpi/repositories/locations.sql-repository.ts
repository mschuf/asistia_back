import { Injectable } from "@nestjs/common";
import type { RowDataPacket } from "mysql2";
import { MysqlService } from "../../mysql/mysql.service";
import { LocationMapper, type DomainLocation } from "../mappers/location.mapper";

interface SqlLocationRow extends RowDataPacket {
  id: number;
  name: string;
  completename: string | null;
  building: string | null;
  room: string | null;
}

@Injectable()
export class LocationsSqlRepository {
  constructor(private readonly mysql: MysqlService) {}

  async listLocationsWithActiveUsers(): Promise<DomainLocation[]> {
    const rows = await this.mysql.query<SqlLocationRow>(
      `SELECT DISTINCT
          l.id,
          l.name,
          COALESCE(NULLIF(TRIM(l.completename), ''), l.name) AS completename,
          l.building,
          l.room
       FROM glpi_locations l
       INNER JOIN glpi_users u ON u.locations_id = l.id
       WHERE u.is_active = 1
         AND COALESCE(u.is_deleted, 0) = 0
       ORDER BY completename ASC, l.name ASC`,
    );

    return rows.map((row) =>
      LocationMapper.toDomain({
        id: row.id,
        name: row.name,
        completename: row.completename ?? row.name,
        building: row.building,
        room: row.room,
      }),
    );
  }
}
