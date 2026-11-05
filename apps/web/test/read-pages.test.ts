import { describe, expect, it, vi } from 'vitest';
import { MAX_PAGES, readPages, readPagesUpTo, type Page } from '../src/api/read-pages';

interface Body {
  readonly items?: unknown;
  readonly next?: unknown;
}

function pageOf(body: unknown): Page<string> | undefined {
  const { items, next } = body as Body;
  if (!Array.isArray(items)) return undefined;
  return typeof next === 'string' ? { items, next } : { items };
}

function answers(...bodies: readonly Body[]) {
  const send = vi.fn(async (_after: string | undefined) => ({ status: 200, body: bodies[Math.min(send.mock.calls.length - 1, bodies.length - 1)] }));
  return send;
}

// A server that names a new cursor on every page, without end.
function endless() {
  return vi.fn(async (after: string | undefined) => ({ status: 200, body: { items: [after ?? 'first'], next: `after-${after ?? 'first'}` } }));
}

describe('readPagesUpTo', () => {
  it('follows the cursors to the last page and joins the items in order', async () => {
    const send = answers({ items: ['a'], next: 'p2' }, { items: ['b', 'c'], next: 'p3' }, { items: ['d'] });
    expect(await readPagesUpTo(send, pageOf)).toEqual({ kind: 'read', value: ['a', 'b', 'c', 'd'], truncated: false });
    expect(send.mock.calls.map(([after]) => after)).toEqual([undefined, 'p2', 'p3']);
  });

  it('stops at the page limit and says that the list was cut short', async () => {
    const send = endless();
    const result = await readPagesUpTo(send, pageOf);
    expect(result).toMatchObject({ kind: 'read', truncated: true });
    expect(send).toHaveBeenCalledTimes(MAX_PAGES);
    expect(result.kind === 'read' ? result.value : []).toHaveLength(MAX_PAGES);
  });

  it('reads a cursor already followed as unreachable, since it loops', async () => {
    const send = answers({ items: ['a'], next: 'p2' }, { items: ['b'], next: 'p2' });
    expect(await readPagesUpTo(send, pageOf)).toEqual({ kind: 'unavailable' });
  });

  it('reads a page without the fields as unreachable', async () => {
    expect(await readPagesUpTo(answers({ items: ['a'], next: 'p2' }, { next: 'p3' }), pageOf)).toEqual({ kind: 'unavailable' });
  });

  it.each([
    [401, { details: { reason: 'unauthenticated' } }, { kind: 'unauthenticated' }],
    [403, { details: { reason: 'role-required', requiredRole: 'installation-owner' } }, { kind: 'denied', requiredRole: 'installation-owner' }],
    [404, {}, { kind: 'not-found' }],
    [503, {}, { kind: 'unavailable' }],
  ])('reads a %s on any page as its failure', async (status, body, failure) => {
    const send = vi.fn(async (after: string | undefined) => (after === undefined ? { status: 200, body: { items: ['a'], next: 'p2' } } : { status, body }));
    expect(await readPagesUpTo(send, pageOf)).toEqual(failure);
  });

  it('maps a failed page with the failure mapping it is given', async () => {
    const send = vi.fn(async (after: string | undefined) => (after === undefined ? { status: 200, body: { items: ['a'], next: 'p2' } } : { status: 403, body: {} }));
    const unavailable = vi.fn(() => ({ kind: 'unavailable' }) as const);
    expect(await readPagesUpTo(send, pageOf, unavailable)).toEqual({ kind: 'unavailable' });
    expect(unavailable.mock.calls).toEqual([[{ status: 403, body: {} }]]);
  });

  it('reads a send that throws as unreachable', async () => {
    const send = vi.fn(async () => {
      throw new TypeError('offline');
    });
    expect(await readPagesUpTo(send, pageOf)).toEqual({ kind: 'unavailable' });
  });
});

describe('readPages', () => {
  it('answers the joined items without the truncation flag', async () => {
    expect(await readPages(answers({ items: ['a'], next: 'p2' }, { items: ['b'] }), pageOf)).toEqual({ kind: 'read', value: ['a', 'b'] });
  });

  it('reads a list the page limit cut short as unreachable, as the board does', async () => {
    const send = endless();
    expect(await readPages(send, pageOf)).toEqual({ kind: 'unavailable' });
    expect(send).toHaveBeenCalledTimes(MAX_PAGES);
  });

  it('passes a failure through', async () => {
    expect(await readPages(vi.fn(async () => ({ status: 404, body: {} })), pageOf)).toEqual({ kind: 'not-found' });
  });
});
