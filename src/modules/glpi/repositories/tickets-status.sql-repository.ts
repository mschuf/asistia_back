/**
 * @file tickets-status.sql-repository.ts
 * @description Escritura directa del estado de tickets en la BD MySQL de GLPI.
 */
import { Injectable } from "@nestjs/common";
import type { QueryValues } from "mysql2";
import type { RowDataPacket } from "mysql2/promise";
import { GLPI_TICKET_STATUS } from "../glpi.constants";
import { TicketMapper, type DomainTicketStatus } from "../mappers/ticket.mapper";
import { MysqlService } from "../../mysql/mysql.service";

interface ContentRow extends RowDataPacket {
  content: string | null;
}

interface StatusRow extends RowDataPacket {
  status: number | null;
}

/**
 * Escritura directa del estado de un ticket sobre la BD de GLPI.
 *
 * Replica el efecto de `PUT /Ticket/:id` (status + content) sin pasar por la
 * API REST de GLPI. Mantiene coherentes `date_mod`, `solvedate` y `closedate`
 * para no romper reportes/SLA al cambiar a Resuelto o Cerrado.
 */
@Injectable()
export class TicketsStatusSqlRepository {
  /** Inyecta el servicio MySQL compartido. */
  constructor(private readonly mysql: MysqlService) {}

  /**
   * Obtiene el contenido HTML crudo del ticket.
   * @param ticketId - ID del ticket GLPI.
   * @returns Contenido o `null` si no existe.
   * @throws Error de base de datos si la consulta falla.
   */
  async getRawContent(ticketId: number): Promise<string | null> {
    const rows = await this.mysql.query<ContentRow>(
      `SELECT content FROM glpi_tickets WHERE id = :id LIMIT 1`,
      { id: ticketId } as QueryValues,
    );
    const content = rows[0]?.content;
    return content === null || content === undefined ? null : String(content);
  }

  /**
   * Lee el estado actual del ticket en dominio.
   * @param ticketId - ID del ticket GLPI.
   * @returns Estado de dominio o `null` si no existe o está borrado.
   * @throws Error de base de datos si la consulta falla.
   */
  async getStatus(ticketId: number): Promise<DomainTicketStatus | null> {
    const rows = await this.mysql.query<StatusRow>(
      `SELECT status FROM glpi_tickets
       WHERE id = :id AND COALESCE(is_deleted, 0) = 0
       LIMIT 1`,
      { id: ticketId } as QueryValues,
    );
    const status = rows[0]?.status;
    return status === null || status === undefined ? null : TicketMapper.mapStatus(Number(status));
  }

  /**
   * Actualiza el estado del ticket. Devuelve `true` si la fila existía y no
   * estaba borrada. `content` (opcional) reemplaza la descripción (usado al
   * adjuntar la nota de resolución).
   * @param ticketId - ID del ticket GLPI.
   * @param statusGlpi - Código numérico de estado GLPI.
   * @param content - Descripción HTML opcional a persistir.
   * @returns `true` si se actualizó al menos una fila.
   * @throws Error de base de datos si el `UPDATE` falla.
   */
  async updateStatus(
    ticketId: number,
    statusGlpi: number,
    content?: string,
  ): Promise<boolean> {
    const sets: string[] = ["status = :status", "date_mod = NOW()"];
    const params: Record<string, unknown> = { id: ticketId, status: statusGlpi };

    if (content !== undefined) {
      sets.push("content = :content");
      params.content = content;
    }

    if (statusGlpi === GLPI_TICKET_STATUS.SOLVED) {
      sets.push("solvedate = NOW()");
    }

    if (statusGlpi === GLPI_TICKET_STATUS.CLOSED) {
      sets.push("closedate = NOW()");
      sets.push("solvedate = COALESCE(solvedate, NOW())");
    }

    const result = await this.mysql.execute(
      `UPDATE glpi_tickets
       SET ${sets.join(", ")}
       WHERE id = :id AND COALESCE(is_deleted, 0) = 0`,
      params as QueryValues,
    );

    return result.affectedRows > 0;
  }
}
