/**
 * @file tickets-create.sql-repository.ts
 * @description Creación y actualización de tickets y actores directamente en MySQL de GLPI.
 */
import { Injectable } from "@nestjs/common";
import type { QueryOptions, QueryValues, RowDataPacket } from "mysql2";
import type { PoolConnection, ResultSetHeader } from "mysql2/promise";
import { GLPI_TICKET_USER_TYPE } from "../glpi.constants";
import { TicketMapper, type DomainTicket } from "../mappers/ticket.mapper";
import { MysqlService } from "../../mysql/mysql.service";

export interface CreateTicketSqlInput {
  name: string;
  content: string;
  type: number;
  status: number;
  urgency: number;
  itilcategories_id: number;
  locations_id?: number;
  entities_id: number;
  requesters_id?: number;
  technicians_id?: number;
}

interface TicketExistenceRow extends RowDataPacket {
  id: number;
}

/**
 * Repositorio SQL para alta de tickets y vínculos Ticket_User en GLPI.
 */
@Injectable()
export class TicketsCreateSqlRepository {
  /** Inyecta el servicio MySQL compartido. */
  constructor(private readonly mysql: MysqlService) {}

  /**
   * Inserta ticket y actores en una transacción MySQL.
   * @param input - Datos del ticket a crear.
   * @returns Ticket de dominio construido desde el input.
   * @throws {Error} Si el insert no devuelve un ID válido.
   */
  async create(input: CreateTicketSqlInput): Promise<DomainTicket> {
    const ticketId = await this.mysql.withTransaction(async (connection) => {
      const createdTicketId = await this.insertTicket(connection, input);
      if (input.requesters_id !== undefined) {
        await this.insertTicketUser(
          connection,
          createdTicketId,
          input.requesters_id,
          GLPI_TICKET_USER_TYPE.REQUESTER,
        );
      }
      if (input.technicians_id) {
        await this.upsertTicketUser(
          connection,
          createdTicketId,
          input.technicians_id,
          GLPI_TICKET_USER_TYPE.ASSIGNED,
        );
      }
      return createdTicketId;
    });

    return TicketsCreateSqlRepository.buildTicketFromInput(ticketId, input);
  }

  /**
   * Asigna técnico al ticket y promueve estado Nuevo→Asignado si aplica.
   * @param ticketId - ID del ticket GLPI.
   * @param technicianId - ID del técnico.
   * @returns `true` si el ticket existía y se actualizó.
   * @throws Error de base de datos si la transacción falla.
   */
  async assignTechnician(ticketId: number, technicianId: number): Promise<boolean> {
    return this.mysql.withTransaction(async (connection) => {
      const exists = await this.ticketExists(connection, ticketId);
      if (!exists) return false;

      await this.upsertTicketUser(
        connection,
        ticketId,
        technicianId,
        GLPI_TICKET_USER_TYPE.ASSIGNED,
      );

      await this.touchTicketStatusIfNew(connection, ticketId);
      return true;
    });
  }

  /**
   * Actualiza la sede (`locations_id`) del ticket.
   * @param ticketId - ID del ticket GLPI.
   * @param locationId - ID de sede GLPI.
   * @returns `true` si se actualizó al menos una fila.
   * @throws Error de base de datos si la transacción falla.
   */
  async updateLocation(ticketId: number, locationId: number): Promise<boolean> {
    return this.mysql.withTransaction(async (connection) => {
      const exists = await this.ticketExists(connection, ticketId);
      if (!exists) return false;

      const options: QueryOptions = {
        sql: `UPDATE glpi_tickets
              SET locations_id = :locationId, date_mod = NOW()
              WHERE id = :ticketId AND COALESCE(is_deleted, 0) = 0`,
        namedPlaceholders: true,
      };
      const [result] = await connection.query<ResultSetHeader>(options, {
        ticketId,
        locationId,
      } as QueryValues);
      return result.affectedRows > 0;
    });
  }

  /**
   * Actualiza el solicitante del ticket en `glpi_tickets_users`.
   * @param ticketId - ID del ticket GLPI.
   * @param requesterId - ID del nuevo solicitante.
   * @returns `true` si el ticket existía y se actualizó.
   * @throws Error de base de datos si la transacción falla.
   */
  async updateRequester(ticketId: number, requesterId: number): Promise<boolean> {
    return this.mysql.withTransaction(async (connection) => {
      const exists = await this.ticketExists(connection, ticketId);
      if (!exists) return false;

      await this.upsertTicketUser(
        connection,
        ticketId,
        requesterId,
        GLPI_TICKET_USER_TYPE.REQUESTER,
      );

      const options: QueryOptions = {
        sql: `UPDATE glpi_tickets
              SET date_mod = NOW()
              WHERE id = :ticketId AND COALESCE(is_deleted, 0) = 0`,
        namedPlaceholders: true,
      };
      await connection.query(options, { ticketId } as QueryValues);
      return true;
    });
  }

  /**
   * Inserta la fila principal en `glpi_tickets`.
   * @param connection - Conexión de transacción activa.
   * @param input - Datos del ticket.
   * @returns ID del ticket insertado.
   * @throws {Error} Si `insertId` no es válido.
   */
  private async insertTicket(
    connection: PoolConnection,
    input: CreateTicketSqlInput,
  ): Promise<number> {
    const options: QueryOptions = {
      sql: `INSERT INTO glpi_tickets (
              entities_id,
              name,
              date,
              date_mod,
              status,
              content,
              urgency,
              priority,
              itilcategories_id,
              type,
              is_deleted,
              locations_id,
              solvedate,
              closedate
            ) VALUES (
              :entities_id,
              :name,
              NOW(),
              NOW(),
              :status,
              :content,
              :urgency,
              :urgency,
              :itilcategories_id,
              :type,
              0,
              :locations_id,
              CASE WHEN :status = 5 THEN NOW() WHEN :status = 6 THEN NOW() ELSE NULL END,
              CASE WHEN :status = 6 THEN NOW() ELSE NULL END
            )`,
      namedPlaceholders: true,
    };

    const [result] = await connection.query<ResultSetHeader>(options, {
      entities_id: input.entities_id,
      name: input.name,
      content: input.content,
      status: input.status,
      urgency: input.urgency,
      itilcategories_id: input.itilcategories_id,
      type: input.type,
      locations_id: input.locations_id ?? 0,
    } as QueryValues);

    const ticketId = Number(result.insertId ?? 0);
    if (!Number.isFinite(ticketId) || ticketId <= 0) {
      throw new Error("Ticket SQL insert did not return a valid ID");
    }
    return ticketId;
  }

  /**
   * Inserta un vínculo en `glpi_tickets_users`.
   * @param connection - Conexión de transacción.
   * @param ticketId - ID del ticket.
   * @param userId - ID del usuario GLPI.
   * @param type - Tipo de actor (`REQUESTER` o `ASSIGNED`).
   * @returns void
   * @throws Error de base de datos si el insert falla.
   */
  private async insertTicketUser(
    connection: PoolConnection,
    ticketId: number,
    userId: number,
    type: number,
  ): Promise<void> {
    const options: QueryOptions = {
      sql: `INSERT INTO glpi_tickets_users
              (tickets_id, users_id, type, use_notification, alternative_email)
            VALUES
              (:ticketId, :userId, :type, 1, '')`,
      namedPlaceholders: true,
    };
    await connection.query(options, {
      ticketId,
      userId,
      type,
    } as QueryValues);
  }

  /**
   * Actualiza o inserta vínculo Ticket_User del tipo indicado.
   * @param connection - Conexión de transacción.
   * @param ticketId - ID del ticket.
   * @param userId - ID del usuario GLPI.
   * @param type - Tipo de actor GLPI.
   * @returns void
   * @throws Error de base de datos si falla update/insert.
   */
  private async upsertTicketUser(
    connection: PoolConnection,
    ticketId: number,
    userId: number,
    type: number,
  ): Promise<void> {
    const options: QueryOptions = {
      sql: `UPDATE glpi_tickets_users
            SET users_id = :userId, use_notification = 1, alternative_email = ''
            WHERE tickets_id = :ticketId AND type = :type`,
      namedPlaceholders: true,
    };
    const [updated] = await connection.query<ResultSetHeader>(options, {
      ticketId,
      userId,
      type,
    } as QueryValues);

    if (updated.affectedRows === 0) {
      await this.insertTicketUser(connection, ticketId, userId, type);
    }
  }

  /**
   * Comprueba existencia de ticket activo (no borrado).
   * @param connection - Conexión de transacción.
   * @param ticketId - ID del ticket.
   * @returns `true` si existe fila activa.
   * @throws Error de base de datos si la consulta falla.
   */
  private async ticketExists(connection: PoolConnection, ticketId: number): Promise<boolean> {
    const options: QueryOptions = {
      sql: `SELECT id FROM glpi_tickets
            WHERE id = :ticketId AND COALESCE(is_deleted, 0) = 0
            LIMIT 1`,
      namedPlaceholders: true,
    };
    const [rows] = await connection.query<TicketExistenceRow[]>(options, {
      ticketId,
    } as QueryValues);
    return Array.isArray(rows) && rows.length > 0;
  }

  /**
   * Pasa tickets en estado Nuevo (1) a Asignado (2) al asignar técnico.
   * @param connection - Conexión de transacción.
   * @param ticketId - ID del ticket.
   * @returns void
   * @throws Error de base de datos si el update falla.
   */
  private async touchTicketStatusIfNew(connection: PoolConnection, ticketId: number): Promise<void> {
    const options: QueryOptions = {
      sql: `UPDATE glpi_tickets
            SET status = CASE WHEN status = 1 THEN 2 ELSE status END,
                date_mod = NOW()
            WHERE id = :ticketId AND COALESCE(is_deleted, 0) = 0`,
      namedPlaceholders: true,
    };
    await connection.query(options, { ticketId } as QueryValues);
  }

  /**
   * Construye `DomainTicket` sintético tras creación SQL.
   * @param ticketId - ID insertado.
   * @param input - Input de creación original.
   * @returns Ticket de dominio con timestamps actuales.
   * @throws No lanza excepciones.
   */
  private static buildTicketFromInput(ticketId: number, input: CreateTicketSqlInput): DomainTicket {
    const description = input.content?.trim();
    return {
      id: ticketId,
      type: TicketMapper.mapType(input.type),
      status: TicketMapper.mapStatus(input.status),
      urgency: TicketMapper.mapUrgency(input.urgency),
      subject: input.name,
      description: description ? description : null,
      categoryId: input.itilcategories_id,
      locationId: input.locations_id ?? null,
      requesterId: input.requesters_id ?? null,
      technicianId: input.technicians_id ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      dueDate: null,
      solvedAt: null,
      closedAt: null,
      isDeleted: false,
    };
  }
}
