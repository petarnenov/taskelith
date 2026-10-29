// Runs one session timeline step with the crash point that the environment
// arms; a killed run prints nothing after its last reached point.
import { writeSync } from 'node:fs';
import type { Result } from '@taskelith/kernel';
import type { NeedsYouItemId, PrincipalId } from '@taskelith/execution';
import { PostgresDatabase, PostgresSessionTimelineStore } from '@taskelith/postgres';
import { crashPointsFromEnvironment, value } from '@taskelith/testing';
import {
  PERSON,
  SESSION,
  allow,
  generation,
  key,
  permissionRequest,
  postgresService,
  requestKey,
  requestSource,
  turn,
} from '../session-timeline-fixtures.ts';

const [, , url, step] = process.argv;
const database = new PostgresDatabase(new URL(url!), { crashPoints: crashPointsFromEnvironment() });
const service = postgresService(database);

// The turn of the given key, whose ID another process minted.
async function turnOf(name: string) {
  const session = value(await service.readSession(SESSION));
  return session.turns.find((candidate) => candidate.key === key(name))!.id;
}

// Acknowledges the open delivery-acknowledgement item of `request-1`.
async function acknowledge(): Promise<Result<unknown>> {
  const store = new PostgresSessionTimelineStore(database);
  const item = value(await store.transaction((tx) => tx.items.find(SESSION, 'delivery-acknowledgement', requestKey('request-1'))));
  return requestSource(store).answer({
    itemId: item!.id as NeedsYouItemId, responder: (PERSON as { principalId: PrincipalId }).principalId,
    answer: { kind: 'delivery-acknowledgement', decision: 'acknowledge' }, idempotencyKey: key('ack-1'),
  });
}

const steps: Readonly<Record<string, () => Promise<Result<unknown>>>> = {
  submit: () => service.submitTurn(SESSION, turn('retried')),
  respond: () => service.consumeResponse(SESSION, allow('answer-1')),
  'record-request': async () => service.recordRequest(SESSION, { ...permissionRequest('request-2', 'turn-1'), turnId: await turnOf('turn-1') }),
  'end-generation': () => service.endGeneration(SESSION, generation(1)),
  'acceptance-unknown': async () => service.recordTurnAcceptanceUnknown(SESSION, { turnId: await turnOf('turn-1'), generation: generation(1) }),
  acknowledge,
  refused: async () => service.recordTurnRefused(SESSION, { turnId: await turnOf('turn-1'), generation: generation(1) }),
};

const result = await steps[step!]!();
writeSync(1, `${JSON.stringify(result)}\n`);
await database.close();
