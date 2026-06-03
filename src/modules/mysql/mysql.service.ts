import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import type { Pool, RowDataPacket } from "mysql2/promise";
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

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
