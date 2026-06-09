const INACTIVE_PREFIXES = ["inactiva", "inactivo", "inactive"] as const;
const ACTIVE_PREFIXES = ["activa", "activo", "active"] as const;

export interface ParsedCompanySearch {
  text?: string;
  isActive?: boolean;
}

function isInactiveToken(token: string): boolean {
  const normalized = token.toLowerCase();
  if (normalized.length < 3) return false;
  if (normalized.startsWith("inac")) return true;
  return INACTIVE_PREFIXES.some((prefix) => prefix.startsWith(normalized));
}

function isActiveToken(token: string): boolean {
  const normalized = token.toLowerCase();
  if (normalized.length < 3) return false;
  if (normalized.startsWith("inac")) return false;
  if (normalized.startsWith("activ")) return true;
  return ACTIVE_PREFIXES.some((prefix) => prefix.startsWith(normalized));
}

export function parseCompanySearch(search: string): ParsedCompanySearch {
  const trimmed = search.trim();
  if (!trimmed) return {};

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  let isActive: boolean | undefined;
  const textTokens: string[] = [];

  for (const token of tokens) {
    if (isInactiveToken(token)) {
      isActive = false;
      continue;
    }
    if (isActiveToken(token)) {
      isActive = true;
      continue;
    }
    textTokens.push(token);
  }

  const text = textTokens.join(" ").trim();
  return {
    ...(text ? { text } : {}),
    ...(isActive !== undefined ? { isActive } : {}),
  };
}
