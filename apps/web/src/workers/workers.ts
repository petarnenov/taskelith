import type { ReadFailed, ReadResult } from '../api/read-result';
import type { components } from '../generated/control-plane';

// The workers and the enrollment tokens of the installation as the SPA
// reads and commands them: the control plane's types, free of HTTP.

type Schemas = components['schemas'];

export type WorkersView = Schemas['WorkersView'];
export type WorkerAdmissionEntry = Schemas['WorkerAdmissionEntry'];
export type WorkerAdmissionState = Schemas['WorkerAdmissionState'];
export type WorkerHost = Schemas['WorkerHost'];
export type SelfCheckResult = Schemas['SelfCheckResult'];
export type SelfCheckOutcome = SelfCheckResult['outcome'];
export type NotApplicableReason = Schemas['NotApplicableReason'];
export type InstallationRole = Schemas['InstallationRole'];
export type Platform = Schemas['Platform'];
export type Architecture = Schemas['Architecture'];
export type HostConstraints = Schemas['HostConstraints'];
export type EnrollmentToken = Schemas['EnrollmentToken'];
export type IssuedEnrollmentToken = Schemas['IssuedEnrollmentToken'];

// The role every operation of this port requires (control-plane.openapi.json).
export const INSTALLATION_OWNER: InstallationRole = 'installation-owner';

// The pending tokens of every page read, and whether the page limit cut
// the list short before its end.
export interface EnrollmentTokenList {
  readonly tokens: readonly EnrollmentToken[];
  readonly truncated: boolean;
}

// A command the control plane refused before it took effect: a stale CSRF
// token, a request it found invalid, or one of the read failures.
export type CommandRefused = { readonly kind: 'csrf-rejected' } | { readonly kind: 'invalid' } | ReadFailed;

// The 201 of issuing or rotating: the one answer that carries the secret.
export type IssueResult = { readonly kind: 'issued'; readonly value: IssuedEnrollmentToken } | CommandRefused;

export type RevokeResult =
  | { readonly kind: 'revoked' }
  | { readonly kind: 'token-used' }
  | { readonly kind: 'token-rotated'; readonly replacementTokenId: string }
  | CommandRefused;

export type RotateResult = IssueResult | { readonly kind: 'token-not-pending' };

export interface WorkersGateway {
  readonly listWorkers: () => Promise<ReadResult<WorkersView>>;
  readonly listEnrollmentTokens: () => Promise<ReadResult<EnrollmentTokenList>>;
  readonly issueEnrollmentToken: (constraints: HostConstraints) => Promise<IssueResult>;
  readonly revokeEnrollmentToken: (tokenId: string) => Promise<RevokeResult>;
  readonly rotateEnrollmentToken: (tokenId: string) => Promise<RotateResult>;
}
