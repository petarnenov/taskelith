import { sameProcess, type ProcessEntry, type ProcessIdentity } from './process-identity.js';

// A surviving process with the group the listing showed it in.
export interface Survivor extends ProcessIdentity {
  readonly processGroupId: number;
}

export type TerminationProof =
  | { readonly proven: true }
  | { readonly proven: false; readonly survivors: readonly Survivor[] };

export interface DarwinTerminationInput {
  readonly processGroupId: number;
  // One kernel listing, taken after the child was reaped; absent when no
  // listing can be taken. The caller asks for two in a row (section 8).
  readonly listing: readonly ProcessEntry[] | undefined;
  readonly recordedDescendants: readonly ProcessIdentity[];
}

// macOS has no containment: the set is empty only if no process carries the
// group's ID and no recorded descendant lives (contract section 8).
export function proveDarwinTermination(input: DarwinTerminationInput): TerminationProof {
  if (input.listing === undefined) return { proven: false, survivors: [] };
  const listing = input.listing;
  const inGroup = listing.filter((entry) => entry.processGroupId === input.processGroupId);
  const escaped = listing.filter((entry) => entry.processGroupId !== input.processGroupId
    && input.recordedDescendants.some((descendant) => sameProcess(entry.identity, descendant)));
  const survivors = [...inGroup, ...escaped].map((entry) => ({ ...entry.identity, processGroupId: entry.processGroupId }));
  return survivors.length === 0 ? { proven: true } : { proven: false, survivors };
}
