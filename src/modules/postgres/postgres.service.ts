import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import type { Pool, QueryResultRow } from "pg";
import { POSTGRES_POOL } from "./postgres.constants";

@Injectable()
export class PostgresService implements OnModuleDestroy {
  constructor(@Inject(POSTGRES_POOL) private readonly pool: Pool) {}

  async query<T extends QueryResultRow = QueryResultRow>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]> {
    const result = await this.pool.query<T>(sql, params);
    return result.rows;
  }

  async ping(): Promise<void> {
    await this.pool.query("SELECT 1");
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
