import { describe, expect, it } from 'vitest';
import { enrollmentTokenOf, enrollmentTokenPageOf, issuedEnrollmentTokenOf, MAX_PAGE_TOKENS } from '../src/workers/tokens-wire';
import { enrollmentToken, issuedToken, TOKEN_SECRET } from './fakes';

const MINTED_ID = `e${'0123456789abcdef'.repeat(2)}`;

describe('enrollmentTokenOf', () => {
  it('reads a token with every constraint and copies only the documented fields', () => {
    const token = enrollmentToken({ tokenId: MINTED_ID, constraints: { platform: 'darwin', architecture: 'arm64', hostname: 'mac-1.example' } });
    expect(enrollmentTokenOf({ ...token, secret: TOKEN_SECRET, constraints: { ...token.constraints, extra: 'planted' } })).toEqual(token);
  });

  it('reads an empty constraints object as one that accepts any host', () => {
    expect(enrollmentTokenOf(enrollmentToken())).toEqual(enrollmentToken({ constraints: {} }));
    expect(enrollmentTokenOf(enrollmentToken())?.constraints).not.toHaveProperty('platform');
  });

  it('shares no object with the body', () => {
    const body = enrollmentToken({ constraints: { hostname: 'h' } });
    const token = enrollmentTokenOf(body);
    expect(token?.constraints).not.toBe(body.constraints);
  });

  it.each([
    ['no identifier', { ...enrollmentToken(), tokenId: undefined }],
    ['an identifier with a space', enrollmentToken({ tokenId: 'token 1' })],
    ['a date-only issuedAt', enrollmentToken({ issuedAt: '2026-11-03' })],
    ['an expiresAt that is no date', enrollmentToken({ expiresAt: '2026-13-45T09:15:00.000Z' })],
    ['no constraints', { ...enrollmentToken(), constraints: undefined }],
    ['a platform outside the enum', enrollmentToken({ constraints: { platform: 'windows' as 'linux' } })],
    ['an architecture outside the enum', enrollmentToken({ constraints: { architecture: 'riscv' as 'x64' } })],
    ['a hostname with a control character', enrollmentToken({ constraints: { hostname: 'b\u0007' } })],
    ['an empty hostname', enrollmentToken({ constraints: { hostname: '' } })],
    ['a number', 7],
    ['null', null],
  ])('refuses %s', (_, body) => {
    expect(enrollmentTokenOf(body)).toBeUndefined();
  });
});

describe('enrollmentTokenPageOf', () => {
  it('reads the tokens and the next cursor', () => {
    const page = enrollmentTokenPageOf({ tokens: [enrollmentToken(), enrollmentToken({ tokenId: 'token-2' })], next: 'token-2' });
    expect(page).toEqual({ items: [enrollmentToken(), enrollmentToken({ tokenId: 'token-2' })], next: 'token-2' });
  });

  it('reads the last page without a cursor', () => {
    expect(enrollmentTokenPageOf({ tokens: [] })).toEqual({ items: [] });
    expect(enrollmentTokenPageOf({ tokens: [] })).not.toHaveProperty('next');
  });

  it('reads a full page of the documented maximum', () => {
    const tokens = Array.from({ length: MAX_PAGE_TOKENS }, (_, index) => enrollmentToken({ tokenId: `token-${index}` }));
    expect(enrollmentTokenPageOf({ tokens })?.items).toHaveLength(MAX_PAGE_TOKENS);
  });

  it.each([
    ['a page over the maximum', { tokens: Array.from({ length: MAX_PAGE_TOKENS + 1 }, () => enrollmentToken()) }],
    ['a token the page cannot read', { tokens: [enrollmentToken(), { tokenId: 'token-2' }] }],
    ['a cursor with a space', { tokens: [enrollmentToken()], next: 'token 2' }],
    ['tokens that are no array', { tokens: {} }],
    ['no body', undefined],
  ])('refuses %s', (_, body) => {
    expect(enrollmentTokenPageOf(body)).toBeUndefined();
  });
});

describe('issuedEnrollmentTokenOf', () => {
  it('reads the token and its secret of the documented shape, dropping any other field', () => {
    expect(issuedEnrollmentTokenOf({ ...issuedToken(), hash: 'planted' })).toEqual(issuedToken());
  });

  it.each([
    ['a secret of another prefix', issuedToken({ secret: `tkop_${'s'.repeat(43)}` })],
    ['a secret one character short', issuedToken({ secret: `tken_${'s'.repeat(42)}` })],
    ['a secret one character long', issuedToken({ secret: `tken_${'s'.repeat(44)}` })],
    ['a secret with a character outside its alphabet', issuedToken({ secret: `tken_${'s'.repeat(42)}+` })],
    ['no secret', { token: enrollmentToken() }],
    ['a token the body cannot read', { token: { tokenId: 'token-1' }, secret: TOKEN_SECRET }],
    ['a text', 'issued'],
  ])('reveals nothing for %s', (_, body) => {
    expect(issuedEnrollmentTokenOf(body)).toBeUndefined();
  });
});
