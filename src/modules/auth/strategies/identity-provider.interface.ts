export interface IdentityResolution {
  login: string;
  domain?: string | null;
  email?: string | null;
  displayName?: string | null;
  rawPassword?: string;
}

export interface IdentityProvider {
  readonly name: string;
  resolveFromRequest(request: unknown): Promise<IdentityResolution | null>;
  resolveFromCredentials?(username: string, password: string): Promise<IdentityResolution | null>;
}

export const IDENTITY_PROVIDER = Symbol("IDENTITY_PROVIDER");
