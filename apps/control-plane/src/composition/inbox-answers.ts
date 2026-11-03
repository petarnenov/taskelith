import type { NeedsYouSource } from '@taskelith/execution';
import type { PostgresDatabase } from '@taskelith/postgres';
import { SecretTextRedactor } from '@taskelith/secrets';
import { InboxAnswers } from '../application/inbox-answers.js';
import { TransactionalReconciliationResolver } from '../application/reconciliation-resolution.js';
import { ANSWERED_ELSEWHERE, ReconciliationSource } from '../application/reconciliation-source.js';
import { boardReadsOf, headPositions, type InboxSourcesIn } from './board-views.js';
import type { AgentSessionServices } from './session-timeline.js';

export interface InboxServices {
  // The sources a view reads, each over the view's snapshot.
  readonly viewSources: InboxSourcesIn;
  readonly answers: InboxAnswers;
}

// The inbox's sources, the native request source and the reconciliation
// source, and the answers over them in one SERIALIZABLE transaction each.
export function startInboxServices(database: PostgresDatabase, sessions: Pick<AgentSessionServices, 'sourceIn' | 'digest'>): InboxServices {
  const redactor = new SecretTextRedactor();
  const viewSources: InboxSourcesIn = (reads, positions) => [
    sessions.sourceIn(reads.timeline, positions),
    new ReconciliationSource({ reads, positions, redactor, resolver: ANSWERED_ELSEWHERE }),
  ];
  const answers = new InboxAnswers({
    transaction: (work) => database.transaction((transaction) => {
      const reads = boardReadsOf(transaction);
      const positions = headPositions(reads);
      const sources: readonly NeedsYouSource[] = [
        sessions.sourceIn(transaction.sessionTimeline, positions),
        new ReconciliationSource({ reads, positions, redactor, resolver: new TransactionalReconciliationResolver(transaction) }),
      ];
      return work({ keys: transaction.inboxAnswerKeys, sources });
    }),
  }, sessions.digest);
  return { viewSources, answers };
}
