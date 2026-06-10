/**
 * @file locations.sql-repository.ts
 * @description Consulta sedes GLPI con usuarios activos vía MySQL.
 */
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

/**
 * Repositorio SQL de sedes asociadas a usuarios activos en GLPI.
 */
@Injectable()
export class LocationsSqlRepository {
  /** Inyecta el servicio MySQL compartido. */
  constructor(private readonly mysql: MysqlService) {}

  /**
   * Lista sedes que tienen al menos un usuario activo asignado.
   * @returns Sedes ordenadas por ruta completa.
   * @throws Error de base de datos si la consulta falla.
   */
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
