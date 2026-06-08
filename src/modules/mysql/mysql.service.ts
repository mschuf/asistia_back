import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { QueryOptions, QueryValues } from "mysql2";
import { MYSQL_POOL } from "./mysql.constants";

@Injectable()
export class MysqlService implements OnModuleDestroy {
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  async query<T extends RowDataPacket = RowDataPacket>(
    sql: string,
    params?: QueryValues,
  ): Promise<T[]> {
    const options: QueryOptions = { sql, namedPlaceholders: true };
    const [rows] = await this.pool.query<T[]>(options, params);
    return rows;
  }

  /** Ejecuta una sentencia de escritura (INSERT/UPDATE/DELETE) y devuelve el header con `affectedRows`. */
  async execute(sql: string, params?: QueryValues): Promise<ResultSetHeader> {
    const options: QueryOptions = { sql, namedPlaceholders: true };
    const [result] = await this.pool.query<ResultSetHeader>(options, params);
    return result;
  }

  async withTransaction<T>(fn: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await fn(connection);
      await connection.commit();
      return result;
    } catch (error) {
      try {
        await connection.rollback();
      } catch {
        // Conexión ya cerrada; propagar error original de la transacción.
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
