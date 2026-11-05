import { MAX_PAGES } from '../api/read-pages';
import type { Architecture, EnrollmentToken, HostConstraints, IssueResult, IssuedEnrollmentToken, Platform, RevokeResult, RotateResult } from './workers';
import { isDisplayText } from './workers-wire';

// The enrollment tokens section's rules, free of React: the constraints
// the form sends, what each answer to a command means, and its words.

export interface ConstraintsForm {
  readonly platform: Platform | '';
  readonly architecture: Architecture | '';
  readonly hostname: string;
}

export const EMPTY_FORM: ConstraintsForm = { platform: '', architecture: '', hostname: '' };

export type FormCheck = { readonly kind: 'ok'; readonly constraints: HostConstraints } | { readonly kind: 'hostname-invalid' };

// An empty field sends no constraint; the hostname is DisplayText, which
// the control plane would refuse with 400 otherwise.
export function checkConstraints({ platform, architecture, hostname }: ConstraintsForm): FormCheck {
  const name = hostname.trim();
  if (name !== '' && !isDisplayText(name)) return { kind: 'hostname-invalid' };
  const constraints: HostConstraints = {
    ...(platform === '' ? {} : { platform }),
    ...(architecture === '' ? {} : { architecture }),
    ...(name === '' ? {} : { hostname: name }),
  };
  return { kind: 'ok', constraints };
}

export type Command =
  | { readonly name: 'issue'; readonly constraints: HostConstraints }
  | { readonly name: 'revoke'; readonly tokenId: string }
  | { readonly name: 'rotate'; readonly tokenId: string };

export type CommandName = Command['name'];
export type CommandResult = IssueResult | RevokeResult | RotateResult;

// A refusal that leaves nothing to retry: a reason of the token, a request
// refused as invalid, or a CSRF refusal that no renewed token could mend.
export type RefusalReason =
  | 'token-used'
  | 'token-not-pending'
  | 'not-found'
  | 'invalid'
  | 'csrf-rejected'
  | 'token-not-renewed'
  | 'session-changed';

export type Settled =
  | { readonly kind: 'issued'; readonly command: Command; readonly issued: IssuedEnrollmentToken }
  | { readonly kind: 'revoked'; readonly command: Command }
  | { readonly kind: 'token-rotated'; readonly command: Command; readonly replacementTokenId: string }
  | { readonly kind: 'refused'; readonly command: Command; readonly reason: RefusalReason }
  | { readonly kind: 'denied'; readonly command: Command; readonly requiredRole?: string }
  | { readonly kind: 'failed'; readonly command: Command; readonly failure: 'unavailable' | 'unauthenticated' };

export type Outcome = Settled | { readonly kind: 'retry-with-new-token' };

// What the status region keeps of an answer: an issued token by its
// identifier alone, since its secret lives in the reveal only.
export type Notice =
  | Exclude<Settled, { readonly kind: 'issued' }>
  | { readonly kind: 'issued'; readonly command: Command; readonly tokenId: string };

export function noticeOf(settled: Settled): Notice {
  if (settled.kind !== 'issued') return settled;
  return { kind: 'issued', command: settled.command, tokenId: settled.issued.token.tokenId };
}

// A CSRF refusal has the session read again and the command sent once
// more, since nothing took effect; a second one is final.
export function outcomeOf(command: Command, result: CommandResult, tokenRefreshed: boolean): Outcome {
  switch (result.kind) {
    case 'issued':
      return { kind: 'issued', command, issued: result.value };
    case 'revoked':
      return { kind: 'revoked', command };
    case 'token-rotated':
      return { kind: 'token-rotated', command, replacementTokenId: result.replacementTokenId };
    case 'csrf-rejected':
      return tokenRefreshed ? refused(command, 'csrf-rejected') : { kind: 'retry-with-new-token' };
    case 'denied':
      return result.requiredRole === undefined ? { kind: 'denied', command } : { kind: 'denied', command, requiredRole: result.requiredRole };
    case 'unavailable':
    case 'unauthenticated':
      return { kind: 'failed', command, failure: result.kind };
    default:
      return refused(command, result.kind);
  }
}

export function refused(command: Command, reason: RefusalReason): Settled {
  return { kind: 'refused', command, reason };
}

// The answers after which the control plane's list differs from the shown
// one, or may: the list is read again after each of them.
export function changesList(settled: Notice): boolean {
  if (settled.kind === 'refused') return settled.reason === 'token-used' || settled.reason === 'token-not-pending' || settled.reason === 'not-found';
  return settled.kind !== 'denied' && settled.kind !== 'failed';
}

// Only a revoke may be sent again on its own: a repeat answers 204.
export function retryable(settled: Notice): boolean {
  return settled.kind === 'failed' && settled.failure === 'unavailable' && settled.command.name === 'revoke';
}

// Reading the list again tells what took effect; the failure texts say so.
export function suggestsRefresh(settled: Notice): boolean {
  return settled.kind === 'failed' && settled.command.name !== 'revoke';
}

export const RUNNING_TEXTS: Readonly<Record<CommandName, string>> = {
  issue: 'Issuing a token…',
  revoke: 'Revoking the token…',
  rotate: 'Rotating the token…',
};

const VERBS: Readonly<Record<CommandName, string>> = { issue: 'issue', revoke: 'revoke', rotate: 'rotate' };
const EFFECTS: Readonly<Record<CommandName, string>> = { issue: 'issued', revoke: 'revoked', rotate: 'rotated' };

export interface StatusText {
  readonly title: string;
  readonly text: string;
}

export function statusTextOf(settled: Notice): StatusText {
  const { command } = settled;
  const id = command.name === 'issue' ? undefined : command.tokenId;
  switch (settled.kind) {
    case 'issued':
      return command.name === 'rotate'
        ? { title: 'Token rotated', text: `Token ${id} stops working now; its replacement ${settled.tokenId} was shown once with its secret.` }
        : { title: 'Token issued', text: `Token ${settled.tokenId} was issued and shown once with its secret.` };
    case 'revoked':
      return { title: 'Token revoked', text: `Token ${id} was revoked; a worker can no longer enroll with it.` };
    case 'token-rotated':
      return { title: 'Token already replaced', text: `Token ${id} was replaced by token ${settled.replacementTokenId}.` };
    case 'refused':
      return refusalTextOf(command, settled.reason);
    case 'denied':
      return {
        title: `No access to ${VERBS[command.name]} tokens`,
        text: withRole(`Your session holds no role that lets you ${VERBS[command.name]} enrollment tokens; nothing was ${EFFECTS[command.name]}.`, settled.requiredRole),
      };
    default:
      return failureTextOf(command, settled.failure);
  }
}

function refusalTextOf(command: Command, reason: RefusalReason): StatusText {
  const id = command.name === 'issue' ? undefined : command.tokenId;
  const verb = VERBS[command.name];
  const effect = EFFECTS[command.name];
  switch (reason) {
    case 'token-used':
      return { title: 'Token already redeemed', text: `Token ${id} was already redeemed by a worker; it is no longer pending. To stop that worker, revoke it with the CLI.` };
    case 'token-not-pending':
      return { title: 'Token not pending', text: `Token ${id} is used, expired, or revoked, so it cannot be rotated.` };
    case 'not-found':
      return { title: 'Token not found', text: `Token ${id} no longer exists.` };
    case 'invalid':
      return { title: `Not ${effect}`, text: `The control plane refused the request as invalid; nothing was ${effect}.` };
    case 'csrf-rejected':
      return { title: `Not ${effect}`, text: `The control plane refused the session token twice, so nothing was ${effect}. Reload the page before you ${verb} again.` };
    case 'token-not-renewed':
      return { title: `Not ${effect}`, text: `The control plane refused the session token and could not be asked for a new one, so nothing was ${effect}.` };
    default:
      return { title: `Not ${effect}`, text: `The session changed while the session token was renewed, so nothing was sent again and nothing was ${effect}.` };
  }
}

// After no usable answer, an issue or a rotation may have taken effect
// without its secret ever being shown; the list can only hint which.
function failureTextOf(command: Command, failure: 'unavailable' | 'unauthenticated'): StatusText {
  const effect = EFFECTS[command.name];
  if (failure === 'unauthenticated') {
    return { title: `Not ${effect}`, text: `The control plane answered this request as one without a session, so nothing was ${effect}.` };
  }
  switch (command.name) {
    case 'issue':
      return {
        title: 'Not issued, or issued but not shown',
        text:
          'The control plane gave no usable answer, so a token may have been issued even though its secret was not shown. ' +
          'Refresh the list: a pending token you do not recognise may be that one, and it can be revoked or rotated. ' +
          'A token missing from the list may still have been issued, since the list shows only pending tokens and may be cut short.',
      };
    case 'rotate':
      return {
        title: 'Not rotated, or rotated but not shown',
        text: `The control plane gave no usable answer. Refresh the list: if token ${command.tokenId} is still listed, it was not rotated; if a new token replaced it, that token can be revoked or rotated.`,
      };
    default:
      return { title: 'Not revoked', text: `The control plane gave no usable answer, so token ${command.tokenId} may still be pending. Retry revokes it again.` };
  }
}

function withRole(text: string, requiredRole: string | undefined): string {
  return requiredRole === undefined ? text : `${text} It needs the role ${requiredRole}.`;
}

// Said of a replacement only while the list read after the answer holds it.
export const REPLACEMENT_PENDING_TEXT = 'It is still pending.';

export const TRUNCATED_TEXT = `Only the first ${MAX_PAGES} pages of pending tokens are shown; the list is cut short.`;

// Taken from the token's own instants, never from a number of the SPA's.
export function validityMinutesOf(token: EnrollmentToken): number {
  return Math.round((Date.parse(token.expiresAt) - Date.parse(token.issuedAt)) / 60_000);
}
