import { failureOf, reachable, type ReadFailed, type ReadResult } from './read-result';

// A paged read of the control plane followed to its end, as the board's
// lists and the enrollment tokens read it.

// A list whose server names new cursors beyond this many pages is cut
// short there; the board reads such a list as unreachable.
export const MAX_PAGES = 100;

export interface Page<T> {
  readonly items: readonly T[];
  readonly next?: string;
}

// An answer as the typed fetch returns it, whatever its operation.
interface Answer {
  readonly status: number;
  readonly body: unknown;
}

export type SendPage = (after: string | undefined) => Promise<Answer>;
export type PageOf<T> = (body: unknown) => Page<T> | undefined;

// The pages read, and whether the page limit stopped the read before its end.
export type PagesRead<T> = { readonly kind: 'read'; readonly value: readonly T[]; readonly truncated: boolean } | ReadFailed;

// Follows a paged read to its end; a cursor already followed loops, which
// reads as unreachable, and the page limit stops endless new ones.
export async function readPagesUpTo<T>(send: SendPage, pageOf: PageOf<T>): Promise<PagesRead<T>> {
  const items: T[] = [];
  const visited = new Set<string>();
  let after: string | undefined;
  do {
    const result = await reachable(() => send(after));
    if (result === undefined) return { kind: 'unavailable' };
    if (result.status !== 200) return failureOf(result);
    const page = pageOf(result.body);
    if (page === undefined || loops(page.next, visited)) return { kind: 'unavailable' };
    items.push(...page.items);
    after = page.next;
    if (after !== undefined && visited.size + 1 >= MAX_PAGES) return { kind: 'read', value: items, truncated: true };
    if (after !== undefined) visited.add(after);
  } while (after !== undefined);
  return { kind: 'read', value: items, truncated: false };
}

// The board's reads: a list the page limit cut short reads as unreachable.
export async function readPages<T>(send: SendPage, pageOf: PageOf<T>): Promise<ReadResult<readonly T[]>> {
  const result = await readPagesUpTo(send, pageOf);
  if (result.kind !== 'read') return result;
  return result.truncated ? { kind: 'unavailable' } : { kind: 'read', value: result.value };
}

function loops(next: string | undefined, visited: ReadonlySet<string>): boolean {
  return next !== undefined && visited.has(next);
}
