import { createHash } from 'node:crypto';
import type { JournalId, ObservationFact, ObservationId } from '@taskelith/execution';

// Derives an observation's identity from its source, so a fact derived again
// after a lost write gets the same identity (contract section 6).
export function observationIdOf(fact: ObservationFact, journalId: JournalId): ObservationId {
  const digest = createHash('sha256').update(JSON.stringify(sourceOf(fact, journalId))).digest('hex');
  return `obs-${digest}` as ObservationId;
}

// A declaration counter is unique only within its journal.
function sourceOf(fact: ObservationFact, journalId: JournalId): readonly (string | number)[] {
  switch (fact.kind) {
    case 'command-rejected':
    case 'assignment-accepted':
    case 'assignment-refused':
      return ['command-outcome', fact.commandId];
    case 'capacity-declared':
      return ['capacity-declared', journalId, fact.declaration];
    case 'admission-pressure-changed':
      return ['admission-pressure-changed', journalId, fact.declaration];
    case 'launch-rejected':
      return ['operation-outcome', fact.operationId];
    case 'cancellation-not-applied':
      return ['cancellation-outcome', fact.commandId, fact.executionId];
    case 'execution-uncertain':
      return ['execution-fact', fact.executionId, fact.kind, fact.evidenceCounter];
    default:
      return ['execution-fact', fact.executionId, fact.kind];
  }
}
