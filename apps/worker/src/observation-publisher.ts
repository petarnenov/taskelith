import type { WorkerJournal } from '@taskelith/execution';
import { ok, type Instant, type Result } from '@taskelith/kernel';
import { abortableDelay, encodeJson, retryDelayMilliseconds, TRANSPORT_LIMITS, type Publication, type PublishOutcome, type TransportLimits } from '@taskelith/nats';
import { observationMessage } from './observation-messages.js';

export interface ObservationPublisherOptions {
  readonly journal: WorkerJournal;
  readonly publish: (publication: Publication) => Promise<Result<PublishOutcome>>;
  readonly observationSubject: string;
  readonly now: () => Instant;
}

// Publishes the journal's due outbox entries in sequence order, each under
// its observationId; a round stops at the first entry that fails.
export async function publishDueObservations(options: ObservationPublisherOptions): Promise<Result<number>> {
  const { journal, publish, observationSubject: subject, now } = options;
  const due = journal.dueForPublication(now());
  if (!due.ok) return due;
  let published = 0;
  for (const entry of due.value) {
    const message = observationMessage(entry);
    if (!message.ok) return message;
    const sent = await publish({ subject, body: encodeJson(message.value), messageId: entry.position.observationId });
    if (!sent.ok) return sent;
    journal.markPublished(entry.position.sequence, now());
    published += 1;
  }
  return ok(published);
}

// Publishes until the signal aborts: again at once after a round that
// published, after a pause when none was due, and with backoff on failure.
export async function runObservationPublisher(
  options: ObservationPublisherOptions,
  signal: AbortSignal,
  limits: TransportLimits = TRANSPORT_LIMITS,
): Promise<void> {
  let failedRounds = 0;
  while (!signal.aborted) {
    const round = await publishDueObservations(options);
    failedRounds = round.ok ? 0 : failedRounds + 1;
    if (round.ok && round.value > 0) continue;
    await abortableDelay(round.ok ? limits.idlePollMilliseconds : retryDelayMilliseconds(failedRounds, limits), signal);
  }
}
