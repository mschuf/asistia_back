/**
 * @file glpi.types.ts
 * @description Tipos TypeScript que modelan las respuestas crudas de la API REST de GLPI.
 */
export interface GlpiInitSessionResponse {
  session_token: string;
}

export interface GlpiUserEmailRaw {
  id?: number;
  users_id?: number;
  email?: string | null;
  is_default?: number | null;
}

export interface GlpiUserRaw {
  id: number;
  name: string;
  realname?: string | null;
  firstname?: string | null;
  phone?: string | number | null;
  mobile?: string | number | null;
  locations_id?: number | null;
  groups_id?: number | null;
  entities_id?: number | null;
  is_active?: number | null;
  is_deleted?: number | null;
  _useremails?: Array<{ email?: string } | string> | string[];
  default_email?: string | null;
  picture?: string | null;
  usertitles_id?: number | string | null;
}

export interface GlpiUserTitleRaw {
  id: number;
  name?: string | null;
}

export interface GlpiEntityRaw {
  id: number;
  name?: string | null;
  completename?: string | null;
  comment?: string | null;
}

export interface GlpiGroupRaw {
  id: number;
  name: string;
  completename?: string;
  comment?: string | null;
}

export interface GlpiProfileRaw {
  id: number;
  name: string;
  comment?: string | null;
}

export interface GlpiProfileUserRaw {
  id?: number;
  users_id?: number;
  profiles_id?: number;
  entities_id?: number;
}

export interface GlpiLocationRaw {
  id: number;
  name: string;
  completename?: string;
  building?: string | null;
  room?: string | null;
}

export interface GlpiItilCategoryRaw {
  id: number;
  name: string;
  completename?: string;
  itilcategories_id?: number | null;
  level?: number;
}

export interface GlpiTicketRaw {
  id: number;
  name: string;
  content?: string | null;
  status: number;
  type: number;
  urgency: number;
  impact?: number;
  priority?: number;
  itilcategories_id?: number | null;
  locations_id?: number | null;
  users_id_recipient?: number | null;
  users_id_lastupdater?: number | null;
  date?: string | null;
  date_mod?: string | null;
  closedate?: string | null;
  solvedate?: string | null;
  time_to_resolve?: string | null;
  entities_id?: number;
  is_deleted?: number | null;
}

export interface GlpiSearchResult<T = unknown> {
  totalcount: number;
  count: number;
  sort: number;
  order: string;
  data: T[];
}
