// The browser session as the shell sees it, free of the wire format that
// the control-plane gateway translates.

export interface Operator {
  readonly loginName: string;
  readonly installationRoles: readonly string[];
  readonly expiresAt: number;
}

export interface Credentials {
  readonly loginName: string;
  readonly password: string;
}

export type SessionRead =
  | { readonly kind: 'anonymous' }
  | { readonly kind: 'authenticated'; readonly operator: Operator }
  | { readonly kind: 'unavailable' };

export type LoginRejection = 'wrong-credentials' | 'invalid-request' | 'form-expired';

export type LoginOutcome =
  | { readonly kind: 'logged-in'; readonly operator: Operator }
  | { readonly kind: 'rejected'; readonly reason: LoginRejection }
  | { readonly kind: 'unavailable' };

export type LogoutOutcome = { readonly kind: 'logged-out' } | { readonly kind: 'failed' };

export interface SessionGateway {
  readonly read: () => Promise<SessionRead>;
  readonly logIn: (credentials: Credentials) => Promise<LoginOutcome>;
  readonly logOut: () => Promise<LogoutOutcome>;
}
