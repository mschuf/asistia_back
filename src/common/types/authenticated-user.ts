export type UserRole = "final_user" | "technician";

export interface AuthenticatedUser {
  id: number;
  login: string;
  name: string;
  email: string | null;
  role: UserRole;
  groupIds: number[];
  locationId: number | null;
  entityId: number | null;
  entityName: string | null;
}

export interface JwtPayload {
  sub: number;
  login: string;
  name: string;
  email: string | null;
  role: UserRole;
  groupIds: number[];
  locationId: number | null;
  entityId: number | null;
  entityName: string | null;
  iat?: number;
  exp?: number;
}
