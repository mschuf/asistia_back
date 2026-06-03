import type { DomainUser } from "./mappers/user.mapper";

export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function emailsMatch(left: string, right: string): boolean {
  return normalizeEmail(left) === normalizeEmail(right);
}

export function matchesUserSearch(user: DomainUser, search: string): boolean {
  const normalized = normalizeForSearch(search);
  if (!normalized) {
    return true;
  }

  const haystack = normalizeForSearch(
    [user.fullName, user.login, user.email, user.firstName, user.lastName]
      .filter(Boolean)
      .join(" "),
  );

  const tokens = normalized.split(/\s+/).filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
}

export function sortUsersByName(users: DomainUser[]): DomainUser[] {
  return [...users].sort((left, right) =>
    left.fullName.localeCompare(right.fullName, "es", { sensitivity: "base" }),
  );
}

export function parseContentRangeTotal(contentRange: string | undefined): number | null {
  if (!contentRange) {
    return null;
  }

  const match = contentRange.match(/\/(\d+)\s*$/);
  return match ? Number(match[1]) : null;
}

