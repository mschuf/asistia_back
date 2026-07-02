import type { AuthenticatedUser } from "../types/authenticated-user";

/** Indica si el usuario puede ejecutar operaciones reservadas a TI. */
export function hasTechnicianAccess(user: AuthenticatedUser): boolean {
  return user.role === "technician" || user.isSuperAdmin === true;
}
