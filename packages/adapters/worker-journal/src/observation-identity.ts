import { createHash } from 'node:crypto';
import type { ObservationFact, ObservationId } from '@taskelith/execution';

// Derives an observation's identity from its source, so a fact derived again
// after a lost write gets the same identity (contract section 6).
export function observationIdOf(fact: ObservationFact): ObservationId {
  const digest = createHash('sha256').update(JSON.stringify(sourceOf(fact))).digest('hex');
  return `obs-${digest}` as ObservationId;
}

function sourceOf(fact: ObservationFact): readonly (string | number)[] {
  switch (fact.kind) {
    case 'command-rejected':
      return ['command-outcome', fact.commandId];
    case 'launch-rejected':
      return ['operation-outcome', fact.operationId];
    case 'execution-uncertain':
      return ['execution-fact', fact.executionId, fact.kind, fact.evidenceCounter];
    default:
      return ['execution-fact', fact.executionId, fact.kind];
  }
}
