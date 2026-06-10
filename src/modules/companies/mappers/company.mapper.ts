/**
 * @file company.mapper.ts
 * @description Mapea filas SQL de empresas a DTOs de respuesta de la API.
 */
import type { CompanyResponseDto } from "../dto/company.response.dto";
import type { CompanyRow } from "../companies.types";

const CLIENT_SECRET_MASK = "••••••••";

/**
 * Convierte una fila de Postgres en DTO de respuesta enmascarando el secreto de cliente.
 * @param row - Fila cruda de `public.companies`.
 * @returns DTO listo para serializar en HTTP.
 */
export function mapCompanyRowToResponse(row: CompanyRow): CompanyResponseDto {
  const hasClientSecret = Boolean(row.ms_client_secret?.trim());

  return {
    id: Number(row.id),
    name: row.name,
    isActive: row.is_active,
    msTenantId: row.ms_tenant_id,
    msClientId: row.ms_client_id,
    hasClientSecret,
    clientSecretMasked: hasClientSecret ? CLIENT_SECRET_MASK : null,
    msMailbox: row.ms_mailbox,
    msMailFolder: row.ms_mail_folder,
    geminiModel: row.gemini_model,
    daemonMaxEmails: row.daemon_max_emails,
    daemonIntervalSeconds: row.daemon_interval_seconds,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
