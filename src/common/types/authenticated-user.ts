export type UserRole = "final_user" | "technician";

export interface AuthenticatedUser {
  id: number;
  role: UserRole;
  locationId: number | null;
}

export interface UserProfile {
  login: string;
  name: string;
  email: string | null;
  groupIds: number[];
  entityId: number | null;
  entityName: string | null;
}

export interface JwtPayload {
  sub: number;
  role: UserRole;
  locationId: number | null;
  iat?: number;
  exp?: number;
}

export type SessionUser = AuthenticatedUser & UserProfile;
