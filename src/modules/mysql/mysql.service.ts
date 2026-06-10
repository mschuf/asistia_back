/**
 * @file mysql.service.ts
 * @description Servicio de acceso SQL a MySQL (GLPI) con consultas, escrituras y transacciones.
 */
import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { QueryOptions, QueryValues } from "mysql2";
import { MYSQL_POOL } from "./mysql.constants";

/**
 * Wrapper del pool MySQL con helpers para lectura, escritura y transacciones.
 */
@Injectable()
export class MysqlService implements OnModuleDestroy {
  /** Inyecta el pool MySQL compartido. */
  constructor(@Inject(MYSQL_POOL) private readonly pool: Pool) {}

  /**
   * Ejecuta una consulta de lectura con placeholders nombrados.
   * @param sql - Sentencia SQL.
   * @param params - Valores de los placeholders.
   * @returns Filas tipadas como `RowDataPacket`.
   */
  async query<T extends RowDataPacket = RowDataPacket>(
    sql: string,
    params?: QueryValues,
  ): Promise<T[]> {
    const options: QueryOptions = { sql, namedPlaceholders: true };
    const [rows] = await this.pool.query<T[]>(options, params);
    return rows;
  }

  /**
   * Ejecuta una sentencia de escritura (INSERT/UPDATE/DELETE) y devuelve el header con `affectedRows`.
   * @param sql - Sentencia SQL de mutación.
   * @param params - Valores de los placeholders.
   * @returns Cabecera de resultado MySQL.
   */
  async execute(sql: string, params?: QueryValues): Promise<ResultSetHeader> {
    const options: QueryOptions = { sql, namedPlaceholders: true };
    const [result] = await this.pool.query<ResultSetHeader>(options, params);
    return result;
  }

  /**
   * Ejecuta una función dentro de una transacción con commit/rollback automático.
   * @param fn - Callback que recibe la conexión transaccional.
   * @returns Valor devuelto por `fn` tras commit exitoso.
   * @throws Propaga cualquier error de `fn` tras intentar rollback.
   */
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

  /**
   * Verifica conectividad ejecutando `SELECT 1`.
   * @returns Promesa resuelta si el pool responde.
   * @throws Error de conexión MySQL si el ping falla.
   */
  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  /**
   * Cierra el pool al destruir el módulo.
   * @returns Promesa resuelta cuando el pool finaliza.
   */
  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
