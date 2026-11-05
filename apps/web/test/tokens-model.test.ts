import { describe, expect, it } from 'vitest';
import { MAX_PAGES } from '../src/api/read-pages';
import {
  changesList,
  checkConstraints,
  EMPTY_FORM,
  outcomeOf,
  retryable,
  statusTextOf,
  suggestsRefresh,
  TRUNCATED_TEXT,
  noticeOf,
  validityMinutesOf,
  type Command,
  type Notice,
} from '../src/workers/tokens-model';
import { enrollmentToken, issuedToken } from './fakes';

const ISSUE: Command = { name: 'issue', constraints: {} };
const REVOKE: Command = { name: 'revoke', tokenId: 'token-1' };
const ROTATE: Command = { name: 'rotate', tokenId: 'token-1' };

describe('checkConstraints', () => {
  it('sends no constraint for an empty form', () => {
    expect(checkConstraints(EMPTY_FORM)).toEqual({ kind: 'ok', constraints: {} });
  });

  it('sends each chosen constraint, the hostname trimmed', () => {
    const check = checkConstraints({ platform: 'darwin', architecture: 'arm64', hostname: '  mac-1.example ' });
    expect(check).toEqual({ kind: 'ok', constraints: { platform: 'darwin', architecture: 'arm64', hostname: 'mac-1.example' } });
  });

  it('sends no hostname for a blank one', () => {
    expect(checkConstraints({ ...EMPTY_FORM, hostname: '   ' })).toEqual({ kind: 'ok', constraints: {} });
  });

  it.each([
    ['a control character', 'build\u0007'],
    ['1,025 characters', 'h'.repeat(1025)],
  ])('refuses a hostname with %s before it is sent', (_, hostname) => {
    expect(checkConstraints({ ...EMPTY_FORM, hostname })).toEqual({ kind: 'hostname-invalid' });
  });

  it('accepts a hostname of 1,024 characters', () => {
    expect(checkConstraints({ ...EMPTY_FORM, hostname: 'h'.repeat(1024) }).kind).toBe('ok');
  });
});

describe('outcomeOf', () => {
  it('settles a 201 as issued with the body of the one answer that carries the secret', () => {
    expect(outcomeOf(ISSUE, { kind: 'issued', value: issuedToken() }, false)).toEqual({ kind: 'issued', command: ISSUE, issued: issuedToken() });
  });

  it('settles a 204 as revoked', () => {
    expect(outcomeOf(REVOKE, { kind: 'revoked' }, false)).toEqual({ kind: 'revoked', command: REVOKE });
  });

  it('settles a rotated token with its replacement', () => {
    const outcome = outcomeOf(REVOKE, { kind: 'token-rotated', replacementTokenId: 'token-2' }, false);
    expect(outcome).toEqual({ kind: 'token-rotated', command: REVOKE, replacementTokenId: 'token-2' });
  });

  it('has the first CSRF refusal read the session again and the second shown as final', () => {
    expect(outcomeOf(ISSUE, { kind: 'csrf-rejected' }, false)).toEqual({ kind: 'retry-with-new-token' });
    expect(outcomeOf(ISSUE, { kind: 'csrf-rejected' }, true)).toEqual({ kind: 'refused', command: ISSUE, reason: 'csrf-rejected' });
  });

  it.each([['token-used'], ['token-not-pending'], ['not-found'], ['invalid']] as const)('settles %s as a refusal', (kind) => {
    expect(outcomeOf(ROTATE, { kind }, false)).toEqual({ kind: 'refused', command: ROTATE, reason: kind });
  });

  it('settles a denial with the role it names', () => {
    expect(outcomeOf(ISSUE, { kind: 'denied', requiredRole: 'installation-owner' }, false)).toEqual({ kind: 'denied', command: ISSUE, requiredRole: 'installation-owner' });
    expect(outcomeOf(ISSUE, { kind: 'denied' }, false)).toEqual({ kind: 'denied', command: ISSUE });
  });

  it.each([['unavailable'], ['unauthenticated']] as const)('settles %s as a failure', (kind) => {
    expect(outcomeOf(REVOKE, { kind }, false)).toEqual({ kind: 'failed', command: REVOKE, failure: kind });
  });
});

const ISSUED: Notice = { kind: 'issued', command: ISSUE, tokenId: 'token-1' };
const ROTATED: Notice = { kind: 'issued', command: ROTATE, tokenId: 'token-2' };
const REVOKED: Notice = { kind: 'revoked', command: REVOKE };
const USED: Notice = { kind: 'refused', command: REVOKE, reason: 'token-used' };
const NOT_PENDING: Notice = { kind: 'refused', command: ROTATE, reason: 'token-not-pending' };
const GONE: Notice = { kind: 'refused', command: ROTATE, reason: 'not-found' };
const REPLACED: Notice = { kind: 'token-rotated', command: REVOKE, replacementTokenId: 'token-2' };
const CSRF_FINAL: Notice = { kind: 'refused', command: ISSUE, reason: 'csrf-rejected' };
const DENIED: Notice = { kind: 'denied', command: ROTATE, requiredRole: 'installation-owner' };
const NO_ANSWER_ISSUE: Notice = { kind: 'failed', command: ISSUE, failure: 'unavailable' };
const NO_ANSWER_ROTATE: Notice = { kind: 'failed', command: ROTATE, failure: 'unavailable' };
const NO_ANSWER_REVOKE: Notice = { kind: 'failed', command: REVOKE, failure: 'unavailable' };

describe('noticeOf', () => {
  it('keeps an issued token by its identifier alone, without its secret', () => {
    const settled = { kind: 'issued', command: ROTATE, issued: issuedToken({ token: enrollmentToken({ tokenId: 'token-2' }) }) } as const;
    expect(noticeOf(settled)).toEqual(ROTATED);
    expect(JSON.stringify(noticeOf(settled))).not.toContain('tken_');
  });

  it('keeps every other answer as it settled', () => {
    expect(noticeOf(REPLACED)).toBe(REPLACED);
  });
});

describe('the answers that change the list', () => {
  it.each([ISSUED, ROTATED, REVOKED, USED, NOT_PENDING, GONE, REPLACED])('read the list again after %o', (settled) => {
    expect(changesList(settled)).toBe(true);
  });

  it.each([CSRF_FINAL, DENIED, NO_ANSWER_ISSUE, NO_ANSWER_REVOKE, { kind: 'refused', command: ISSUE, reason: 'invalid' } as Notice])(
    'leave the list as shown after %o, which took no known effect',
    (settled) => {
      expect(changesList(settled)).toBe(false);
    },
  );
});

describe('what a failed command offers', () => {
  it('a Retry only for a revoke without an answer, since a repeat answers 204', () => {
    expect(retryable(NO_ANSWER_REVOKE)).toBe(true);
    expect(retryable(NO_ANSWER_ISSUE)).toBe(false);
    expect(retryable(NO_ANSWER_ROTATE)).toBe(false);
    expect(retryable(CSRF_FINAL)).toBe(false);
  });

  it('a Refresh for an issue or a rotation without an answer, which may have minted a token', () => {
    expect(suggestsRefresh(NO_ANSWER_ISSUE)).toBe(true);
    expect(suggestsRefresh(NO_ANSWER_ROTATE)).toBe(true);
    expect(suggestsRefresh(NO_ANSWER_REVOKE)).toBe(false);
    expect(suggestsRefresh(USED)).toBe(false);
  });
});

describe('statusTextOf', () => {
  it.each([
    [ISSUED, 'Token issued', 'Token token-1 was issued and shown once with its secret.'],
    [ROTATED, 'Token rotated', 'Token token-1 stops working now; its replacement token-2 was shown once with its secret.'],
    [REVOKED, 'Token revoked', 'Token token-1 was revoked; a worker can no longer enroll with it.'],
    [USED, 'Token already redeemed', 'Token token-1 was already redeemed by a worker; it is no longer pending. To stop that worker, revoke it with the CLI.'],
    [REPLACED, 'Token already replaced', 'Token token-1 was replaced by token token-2, which is still pending.'],
    [NOT_PENDING, 'Token not pending', 'Token token-1 is used, expired, or revoked, so it cannot be rotated.'],
    [GONE, 'Token not found', 'Token token-1 no longer exists.'],
    [CSRF_FINAL, 'Not issued', 'The control plane refused the session token twice, so nothing was issued. Reload the page before you issue again.'],
    [
      DENIED,
      'No access to rotate tokens',
      'Your session holds no role that lets you rotate enrollment tokens; nothing was rotated. It needs the role installation-owner.',
    ],
    [
      NO_ANSWER_ISSUE,
      'Not issued, or issued but not shown',
      'The control plane did not answer. Refresh the list: a token you do not see here was not issued, and one you see without its secret can be revoked or rotated.',
    ],
    [NO_ANSWER_REVOKE, 'Not revoked', 'The control plane did not answer, so token token-1 may still be pending. Retry revokes it again.'],
  ])('words %o', (settled, title, text) => {
    expect(statusTextOf(settled)).toEqual({ title, text });
  });

  it('names no CLI command', () => {
    for (const settled of [USED, NO_ANSWER_ISSUE, NO_ANSWER_ROTATE]) {
      expect(statusTextOf(settled).text).not.toMatch(/taskelith\s+\S/);
    }
  });

  it('words the other refusals and failures by the command', () => {
    expect(statusTextOf({ kind: 'refused', command: REVOKE, reason: 'invalid' }).text).toContain('nothing was revoked');
    expect(statusTextOf({ kind: 'refused', command: ROTATE, reason: 'token-not-renewed' }).text).toContain('nothing was rotated');
    expect(statusTextOf({ kind: 'refused', command: ISSUE, reason: 'session-changed' }).text).toContain('nothing was sent again');
    expect(statusTextOf({ kind: 'failed', command: REVOKE, failure: 'unauthenticated' }).text).toContain('without a session');
    expect(statusTextOf(NO_ANSWER_ROTATE).text).toContain('if token token-1 is still listed, it was not rotated');
    expect(statusTextOf({ kind: 'denied', command: ISSUE }).text).not.toContain('needs the role');
  });
});

describe('the truncated note and the validity', () => {
  it('names the page limit', () => {
    expect(TRUNCATED_TEXT).toContain(String(MAX_PAGES));
  });

  it('takes the validity from the token’s own instants', () => {
    expect(validityMinutesOf(enrollmentToken())).toBe(15);
    expect(validityMinutesOf(enrollmentToken({ expiresAt: '2026-11-03T10:00:00.000Z' }))).toBe(60);
  });
});
