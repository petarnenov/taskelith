import { sameProcess, type ProcessEntry, type ProcessIdentity } from './process-identity.js';

export type TerminationProof =
  | { readonly proven: true }
  | { readonly proven: false; readonly survivors: readonly ProcessIdentity[] };

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
  const inGroup = listing.filter((entry) => entry.processGroupId === input.processGroupId).map((entry) => entry.identity);
  const escaped = input.recordedDescendants.filter((descendant) =>
    listing.some((entry) => sameProcess(entry.identity, descendant)) && !inGroup.some((member) => sameProcess(member, descendant)));
  const survivors = [...inGroup, ...escaped];
  return survivors.length === 0 ? { proven: true } : { proven: false, survivors };
}
