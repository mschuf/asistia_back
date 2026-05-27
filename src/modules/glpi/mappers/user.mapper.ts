import type { GlpiUserRaw } from "../glpi.types";

export interface DomainUser {
  id: number;
  login: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  locationId: number | null;
  primaryGroupId: number | null;
  entityId: number | null;
  isActive: boolean;
}

function toOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

export class UserMapper {
  static toDomain(raw: GlpiUserRaw): DomainUser {
    const firstName = toOptionalString(raw.firstname);
    const lastName = toOptionalString(raw.realname);
    const composed = [firstName, lastName].filter(Boolean).join(" ").trim();
    const fullName = composed.length > 0 ? composed : raw.name;

    const email = UserMapper.extractEmail(raw);

    return {
      id: raw.id,
      login: raw.name,
      firstName,
      lastName,
      fullName,
      email,
      phone: toOptionalString(raw.phone),
      mobile: toOptionalString(raw.mobile),
      locationId: raw.locations_id ?? null,
      primaryGroupId: raw.groups_id ?? null,
      entityId: raw.entities_id ?? null,
      isActive: raw.is_active !== 0 && raw.is_deleted !== 1,
    };
  }

  private static extractEmail(raw: GlpiUserRaw): string | null {
    if (raw.default_email) return String(raw.default_email);
    const emails = raw._useremails;
    if (!emails) return null;
    if (Array.isArray(emails)) {
      for (const entry of emails) {
        if (typeof entry === "string" && entry.includes("@")) return entry;
        if (entry && typeof entry === "object" && typeof entry.email === "string" && entry.email.includes("@")) {
          return entry.email;
        }
      }
    }
    return null;
  }
}
