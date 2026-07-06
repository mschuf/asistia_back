/**
 * @file ers-documents.sql-repository.ts
 * @description Consultas MySQL de documentos vinculados a proyectos GLPI.
 */
import { Injectable } from "@nestjs/common";
import type { QueryValues } from "mysql2";
import type { RowDataPacket } from "mysql2/promise";
import { MysqlService } from "../../mysql/mysql.service";
import type { ListErsDocumentsQueryDto } from "../dto/list-ers-documents-query.dto";
import type { ErsDocument, ErsDocumentList } from "../ers-documents.types";

interface CountRow extends RowDataPacket { total: number; }
interface ProjectRow extends RowDataPacket { entities_id: number; }
interface DocumentRow extends RowDataPacket {
  id: number;
  filename: string | null;
  name: string | null;
  mime: string | null;
  created_at: string | null;
}

const SORT_SQL = {
  name: "COALESCE(NULLIF(d.name, ''), d.filename)",
  type: "d.mime",
  createdAt: "COALESCE(d.date_creation, di.date_mod, d.date_mod)",
} as const;

@Injectable()
export class ErsDocumentsSqlRepository {
  constructor(private readonly mysql: MysqlService) {}

  async findProjectEntity(projectId: number): Promise<number | null> {
    const rows = await this.mysql.query<ProjectRow>(
      `SELECT entities_id FROM glpi_projects
       WHERE id = :projectId AND COALESCE(is_deleted, 0) = 0 LIMIT 1`,
      { projectId },
    );
    return rows[0] ? Number(rows[0].entities_id ?? 0) : null;
  }

  async list(projectId: number, query: ListErsDocumentsQueryDto): Promise<ErsDocumentList> {
    const page = Math.max(1, query.page ?? 1);
    const limit = query.limit ?? "15";
    const params: Record<string, unknown> = { projectId };
    const where = [
      "di.itemtype = 'Project'",
      "di.items_id = :projectId",
      "COALESCE(d.is_deleted, 0) = 0",
    ];
    const search = query.search?.trim().toLowerCase();
    if (search) {
      where.push(`(LOWER(COALESCE(d.name, '')) LIKE :search
        OR LOWER(COALESCE(d.filename, '')) LIKE :search
        OR LOWER(COALESCE(d.mime, '')) LIKE :search
        OR DATE_FORMAT(COALESCE(d.date_creation, di.date_mod, d.date_mod), '%d/%m/%Y') LIKE :search)`);
      params.search = `%${search}%`;
    }
    const name = query.name?.trim().toLowerCase();
    if (name) {
      where.push("LOWER(COALESCE(NULLIF(d.name, ''), d.filename, '')) LIKE :name");
      params.name = `%${name}%`;
    }
    if (query.type === "image") where.push("LOWER(COALESCE(d.mime, '')) LIKE 'image/%'");
    if (query.type === "pdf") where.push("LOWER(COALESCE(d.mime, '')) = 'application/pdf'");
    if (query.type === "text") where.push("LOWER(COALESCE(d.mime, '')) = 'text/plain'");
    if (query.dateFrom) {
      where.push("COALESCE(d.date_creation, di.date_mod, d.date_mod) >= :dateFrom");
      params.dateFrom = query.dateFrom;
    }
    if (query.dateTo) {
      where.push("COALESCE(d.date_creation, di.date_mod, d.date_mod) < DATE_ADD(:dateTo, INTERVAL 1 DAY)");
      params.dateTo = query.dateTo;
    }

    const whereSql = where.join(" AND ");
    const countRows = await this.mysql.query<CountRow>(
      `SELECT COUNT(*) AS total
       FROM glpi_documents_items di
       INNER JOIN glpi_documents d ON d.id = di.documents_id
       WHERE ${whereSql}`,
      params as QueryValues,
    );
    const total = Number(countRows[0]?.total ?? 0);
    const sortSql = query.sortBy ? SORT_SQL[query.sortBy] : "d.id";
    const sortOrder = query.sortBy ? (query.sortOrder ?? "desc").toUpperCase() : "DESC";
    let paginationSql = "";
    if (limit !== "all") {
      const numericLimit = Number(limit);
      params.limit = numericLimit;
      params.offset = (page - 1) * numericLimit;
      paginationSql = "LIMIT :limit OFFSET :offset";
    }
    const rows = await this.mysql.query<DocumentRow>(
      `SELECT d.id, d.filename, d.name, d.mime,
          DATE_FORMAT(COALESCE(d.date_creation, di.date_mod, d.date_mod), '%Y-%m-%dT%H:%i:%s.000Z') AS created_at
       FROM glpi_documents_items di
       INNER JOIN glpi_documents d ON d.id = di.documents_id
       WHERE ${whereSql}
       ORDER BY ${sortSql} ${sortOrder}, d.id DESC
       ${paginationSql}`,
      params as QueryValues,
    );
    return { items: rows.map((row) => this.map(row)), total, page: limit === "all" ? 1 : page, limit };
  }

  async findLinkedDocument(projectId: number, documentId: number): Promise<ErsDocument | null> {
    const rows = await this.mysql.query<DocumentRow>(
      `SELECT d.id, d.filename, d.name, d.mime,
          DATE_FORMAT(COALESCE(d.date_creation, di.date_mod, d.date_mod), '%Y-%m-%dT%H:%i:%s.000Z') AS created_at
       FROM glpi_documents_items di
       INNER JOIN glpi_documents d ON d.id = di.documents_id
       WHERE di.itemtype = 'Project' AND di.items_id = :projectId
         AND d.id = :documentId AND COALESCE(d.is_deleted, 0) = 0
       LIMIT 1`,
      { projectId, documentId },
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  private map(row: DocumentRow): ErsDocument {
    return {
      id: Number(row.id),
      name: String(row.filename || row.name || `documento-${row.id}`),
      mimeType: String(row.mime || "application/octet-stream"),
      createdAt: row.created_at ? String(row.created_at) : null,
    };
  }
}
