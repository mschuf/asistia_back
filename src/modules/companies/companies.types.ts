import type { QueryResultRow } from "pg";

export interface CompanyRow extends QueryResultRow {
  id: string;
  name: string;
  is_active: boolean;
  ms_tenant_id: string;
  ms_client_id: string;
  ms_client_secret: string;
  ms_mailbox: string;
  ms_mail_folder: string;
  gemini_model: string;
  daemon_max_emails: number;
  daemon_interval_seconds: number;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface CompanyListFilters {
  page: number;
  limit: number;
  search?: string;
  activeOnly?: boolean;
}

export interface CreateCompanyInput {
  name: string;
  isActive: boolean;
  msTenantId: string;
  msClientId: string;
  msClientSecret: string;
  msMailbox: string;
  msMailFolder: string;
  geminiModel: string;
  daemonMaxEmails: number;
  daemonIntervalSeconds: number;
}

export interface UpdateCompanyInput {
  name?: string;
  isActive?: boolean;
  msTenantId?: string;
  msClientId?: string;
  msClientSecret?: string;
  msMailbox?: string;
  msMailFolder?: string;
  geminiModel?: string;
  daemonMaxEmails?: number;
  daemonIntervalSeconds?: number;
}
