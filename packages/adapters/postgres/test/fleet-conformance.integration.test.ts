import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { inspect } from 'node:util';
import { OPERATOR_CREDENTIALS_CONFORMANCE } from '@taskelith/access';
import {
  FLEET_REGISTRY_CONFORMANCE,
  INSTALLATION_TABLE_CONFORMANCE,
  WORKER_ADMISSION_CONFORMANCE,
  decideWorkerAdmission,
  fleetToken,
  fleetWorker,
  installationIdentity,
  type CredentialGeneration,
  type EnrolledWorker,
} from '@taskelith/fleet';
import {
  CommittingFleetRegistry,
  CommittingInstallationTable,
  CommittingOperatorCredentials,
  CommittingWorkerAdmissions,
  PostgresDatabase,
} from '@taskelith/postgres';
import type { ConformanceCase } from '@taskelith/sdlc';
import { ok, parseInstant, type Instant, type Result } from '@taskelith/kernel';
import { value } from '@taskelith/testing';
import pg from 'pg';
import { createMigratedDatabase, query, steppedClockCredentials, truncateAll } from './test-database.ts';

const url = await createMigratedDatabase();
const database = new PostgresDatabase(url);
after(() => database.close());
// A database clock that stands still until a test steps it, ahead of the
// real one, so the transaction start that `now()` reads is never expired.
const AT = value(parseInstant('2026-10-25T09:00:00.000Z'));
const STEPPED_AT = '2099-01-01T00:00:00.000Z';
const TOKEN_LIFETIME_MILLISECONDS = 1000;
const STEPPED_EXPIRY = value(parseInstant(new Date(Date.parse(STEPPED_AT) + TOKEN_LIFETIME_MILLISECONDS).toISOString()));
const steppedClock = await steppedClockCredentials(url, STEPPED_AT);
const steppedDatabase = new PostgresDatabase(steppedClock.credentials);
after(() => steppedDatabase.close());

function runSuite<Port>(port: string, cases: readonly ConformanceCase<Port>[], create: () => Port): void {
  for (const conformance of cases) {
    test(`PostgreSQL ${port}: ${conformance.name}`, { concurrency: false }, async () => {
      await truncateAll(url);
      assert.deepEqual(await conformance.check(create()), []);
    });
  }
}

runSuite('fleet registry', FLEET_REGISTRY_CONFORMANCE, () => new CommittingFleetRegistry(database));
runSuite('installation table', INSTALLATION_TABLE_CONFORMANCE, () => new CommittingInstallationTable(database));
runSuite('operator credentials', OPERATOR_CREDENTIALS_CONFORMANCE, () => new CommittingOperatorCredentials(database));
runSuite('worker admissions', WORKER_ADMISSION_CONFORMANCE, () => ({
  registry: new CommittingFleetRegistry(database), admissions: new CommittingWorkerAdmissions(database),
  // A record whose enrollment time no longer parses cannot be read.
  breakWorker: async (workerId) => {
    await query(url, `UPDATE workers SET enrollment = jsonb_set(enrollment::jsonb, '{enrolledAt}', '"never"')::text
      WHERE worker_id = $1`, [workerId]);
  },
}));

test('an enrolled worker is placeable once reachable and admitted, and a revoked one is not', { concurrency: false }, async () => {
  await truncateAll(url);
  const registry = new CommittingFleetRegistry(database);
  value(await registry.addToken(fleetToken('t1')));
  const worker = fleetWorker('w1', 'j1');
  value(await registry.enroll(fleetToken('t1').hash, worker));
  const placement = () => database.transaction(async (tx) => ({ ok: true as const, value: await tx.workers.get(worker.workerId) }));

  assert.deepEqual(value(await placement()), {
    workerId: worker.workerId, enrolled: true, revoked: false, draining: false, reachable: false,
    slots: 2, cpuMillicores: 4000, memoryMebibytes: 8192, controls: ['cpu-limit', 'memory-limit'], protocolVersion: 1, admitted: false,
  });
  const passed = { checkId: 'linux-containment', outcome: 'passed', details: [] } as const;
  const admissions = new CommittingWorkerAdmissions(database);
  value(await admissions.record(worker.workerId, decideWorkerAdmission([passed], 'linux'), 1 as never, worker.enrolledAt));
  assert.equal(value(await placement())?.admitted, true);
  value(await registry.revoke(worker.workerId, worker.enrolledAt));
  assert.equal(value(await placement())?.revoked, true);
});

test('a token that expires while its use waits for the row lock enrolls nothing', { concurrency: false }, async () => {
  await truncateAll(url);
  await steppedClock.stepTo(0);
  assert.deepEqual(await query(steppedClock.credentials, 'SELECT clock_timestamp() AS at'), [{ at: new Date(STEPPED_AT) }]);
  const registry = new CommittingFleetRegistry(steppedDatabase);
  value(await registry.addToken(fleetToken('t1', {}, STEPPED_EXPIRY)));
  const [holder, observer] = await connectedPair();
  let enrolling: Promise<Result<void>> | undefined;
  try {
    await holder.query('BEGIN');
    await holder.query("SELECT 1 FROM enrollment_tokens WHERE secret_hash = 't1' FOR UPDATE");
    enrolling = registry.enroll(fleetToken('t1').hash, fleetWorker('w1', 'j1'));
    await waitForWaitingStatement(enrolling, observer, steppedClock.credentials.username, 'UPDATE enrollment_tokens %');
    await steppedClock.stepTo(2 * TOKEN_LIFETIME_MILLISECONDS);
    await holder.query('COMMIT');
    const enrolled = await enrolling;
    assert.equal(!enrolled.ok && enrolled.error.details.reason, 'token-expired');
  } finally {
    // Ending the holder also releases its lock after a failed step.
    await Promise.allSettled([holder.end(), observer.end()]);
    await Promise.allSettled([enrolling]);
  }
});

// The holder only locks the row, so the rotation's locking SELECT meets an
// unchanged row: an expiry read in its projection would predate the wait.
test('a token that expires while its rotation waits for the row lock is not rotated', { concurrency: false }, async () => {
  await truncateAll(url);
  await steppedClock.stepTo(0);
  const registry = new CommittingFleetRegistry(steppedDatabase);
  value(await registry.addToken(fleetToken('t1', {}, STEPPED_EXPIRY)));
  const [holder, observer] = await connectedPair();
  let rotating: Promise<Result<void>> | undefined;
  try {
    await holder.query('BEGIN');
    await holder.query("SELECT 1 FROM enrollment_tokens WHERE token_id = 'id-t1' FOR UPDATE");
    rotating = registry.rotateToken('id-t1', fleetToken('t2'), AT);
    await waitForWaitingStatement(rotating, observer, steppedClock.credentials.username, 'SELECT used_at%');
    await steppedClock.stepTo(2 * TOKEN_LIFETIME_MILLISECONDS);
    await holder.query('COMMIT');
    const rotated = await rotating;
    assert.equal(!rotated.ok && rotated.error.details.reason, 'token-not-pending');
    assert.equal(value(await registry.tokenById('id-t2')), undefined, 'no replacement is stored');
    assert.deepEqual(await query(url, 'SELECT revoked_at, replacement_token_id FROM enrollment_tokens'), [{ revoked_at: null, replacement_token_id: null }]);
  } finally {
    await Promise.allSettled([holder.end(), observer.end()]);
    await Promise.allSettled([rotating]);
  }
});

// Rotation wins over expiry (design, decision 6): the revocation of a
// rotated token names its replacement also once the old token has expired.
test('a rotated token that then expires is still refused as rotated, naming its replacement', { concurrency: false }, async () => {
  await truncateAll(url);
  await steppedClock.stepTo(0);
  const registry = new CommittingFleetRegistry(steppedDatabase);
  value(await registry.addToken(fleetToken('t1', {}, STEPPED_EXPIRY)));
  value(await registry.rotateToken('id-t1', fleetToken('t2'), AT));
  await steppedClock.stepTo(2 * TOKEN_LIFETIME_MILLISECONDS);
  const expiry = "SELECT expires_at <= clock_timestamp() AS expired FROM enrollment_tokens WHERE token_id = 'id-t1'";
  assert.deepEqual(await query(steppedClock.credentials, expiry), [{ expired: true }], 'the old token has expired');
  const revoked = await registry.revokeToken('id-t1', AT);
  assert.deepEqual(!revoked.ok && revoked.error.details, { reason: 'token-rotated', replacementTokenId: 'id-t2' });
  assert.deepEqual(await pendingIds(registry), ['id-t2'], 'the replacement stays pending');
  assert.equal(value(await registry.unusedToken(fleetToken('t1').hash)), undefined, 'the old token enrolls nothing');
});

// Token commands and a redemption of the pending token `id-t1` (hash `t1`).
type TokenWrite<Value> = (registry: CommittingFleetRegistry) => Promise<Result<Value>>;
const revoke: TokenWrite<void> = (registry) => registry.revokeToken('id-t1', AT);
const redeem: TokenWrite<void> = (registry) => registry.enroll(fleetToken('t1').hash, fleetWorker('w1', 'j1'));
const rotate = (hash: string): TokenWrite<void> => (registry) => registry.rotateToken('id-t1', fleetToken(hash), AT);
const reasonOf = (result: Result<unknown>) => (result.ok ? 'success' : result.error.details.reason);
const pendingIds = async (registry: CommittingFleetRegistry) => value(await registry.pendingTokens(undefined, 10)).map((token) => token.tokenId);
const workerCount = async (registry: CommittingFleetRegistry) => value(await registry.activeWorkerIds()).length;

interface RowLockRace {
  readonly name: string;
  readonly first: TokenWrite<void>;
  readonly second: TokenWrite<void>;
  readonly check: (registry: CommittingFleetRegistry, first: Result<void>, second: Result<void>) => Promise<void>;
}

// PostgreSQL grants the row lock to its waiters in the order they queued,
// so the write that waited first is the winner, and the other is refused.
const ROW_LOCK_RACES: readonly RowLockRace[] = [
  {
    name: 'a revocation that waits first wins over a redemption',
    first: revoke, second: redeem,
    check: async (registry, revoked, enrolled) => {
      assert.deepEqual([revoked.ok, reasonOf(enrolled), await workerCount(registry)], [true, 'token-revoked', 0]);
    },
  },
  {
    name: 'a redemption that waits first wins over a revocation',
    first: redeem, second: revoke,
    check: async (registry, enrolled, revoked) => {
      assert.deepEqual([enrolled.ok, reasonOf(revoked), await workerCount(registry)], [true, 'token-used', 1]);
    },
  },
  {
    name: 'a rotation that waits first wins over a redemption',
    first: rotate('t2'), second: redeem,
    check: async (registry, rotated, enrolled) => {
      assert.deepEqual([rotated.ok, reasonOf(enrolled), await workerCount(registry), await pendingIds(registry)], [true, 'token-revoked', 0, ['id-t2']]);
    },
  },
  {
    name: 'a redemption that waits first wins over a rotation, which inserts no replacement',
    first: redeem, second: rotate('t2'),
    check: async (registry, enrolled, rotated) => {
      assert.deepEqual([enrolled.ok, reasonOf(rotated), await workerCount(registry), await pendingIds(registry)], [true, 'token-not-pending', 1, []]);
      assert.equal(value(await registry.tokenById('id-t2')), undefined);
    },
  },
  {
    name: 'a rotation that waits first wins over a revocation, which names the replacement',
    first: rotate('t2'), second: revoke,
    check: async (registry, rotated, revoked) => {
      assert.deepEqual([rotated.ok, reasonOf(revoked), !revoked.ok && revoked.error.details.replacementTokenId], [true, 'token-rotated', 'id-t2']);
      assert.deepEqual(await pendingIds(registry), ['id-t2']);
    },
  },
  {
    name: 'a revocation that waits first wins over a rotation, which inserts no replacement',
    first: revoke, second: rotate('t2'),
    check: async (registry, revoked, rotated) => {
      assert.deepEqual([revoked.ok, reasonOf(rotated), await pendingIds(registry)], [true, 'token-not-pending', []]);
      assert.equal(value(await registry.tokenById('id-t2')), undefined);
    },
  },
  {
    name: 'of two rotations the one that waits first wins, and one replacement is pending',
    first: rotate('t2'), second: rotate('t3'),
    check: async (registry, winner, loser) => {
      assert.deepEqual([winner.ok, reasonOf(loser), await pendingIds(registry)], [true, 'token-not-pending', ['id-t2']]);
      assert.equal(value(await registry.tokenById('id-t3')), undefined);
    },
  },
];

for (const race of ROW_LOCK_RACES) {
  test(`under the row lock ${race.name}`, { concurrency: false }, async () => {
    await truncateAll(url);
    const registry = new CommittingFleetRegistry(database);
    value(await registry.addToken(fleetToken('t1')));
    const [first, second] = await racedForTokenRow(() => race.first(registry), () => race.second(registry));
    await race.check(registry, first, second);
    assert.equal(value(await registry.unusedToken(fleetToken('t1').hash)), undefined, 'the token is no longer pending');
  });
}

// Runs `first`, then `second` once `first` waits for the locked token row,
// and releases the row when both wait; the observer polls outside them.
async function racedForTokenRow<A, B>(first: () => Promise<A>, second: () => Promise<B>): Promise<[A, B]> {
  const [holder, observer] = await connectedPair();
  let racing: Promise<[A, B]> | undefined;
  try {
    await holder.query('BEGIN');
    await holder.query("SELECT 1 FROM enrollment_tokens WHERE token_id = 'id-t1' FOR UPDATE");
    const holderPid = await backendPid(holder);
    const firstCall = first();
    racing = Promise.all([firstCall, waitForLockWaiters(firstCall, observer, holderPid, 1).then(second)]);
    await waitForLockWaiters(racing, observer, holderPid, 2);
    await holder.query('COMMIT');
    return await racing;
  } finally {
    await Promise.allSettled([holder.end(), observer.end()]);
    await Promise.allSettled([racing]);
  }
}

test('a rotation whose link to the inserted replacement fails is rolled back whole', { concurrency: false }, async () => {
  await truncateAll(url);
  const registry = new CommittingFleetRegistry(database);
  value(await registry.addToken(fleetToken('t1')));
  // The fault between the replacement's INSERT and the token's UPDATE.
  await query(url, `CREATE FUNCTION fail_rotation_link() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'injected fault after the replacement insert'; END $$`);
  await query(url, 'CREATE TRIGGER fail_rotation_link BEFORE UPDATE OF replacement_token_id ON enrollment_tokens FOR EACH ROW EXECUTE FUNCTION fail_rotation_link()');
  try {
    await assert.rejects(registry.rotateToken('id-t1', fleetToken('t2'), AT), /injected fault after the replacement insert/);
    assert.equal(value(await registry.tokenById('id-t2')), undefined, 'the replacement insert is rolled back');
    assert.deepEqual(await pendingIds(registry), ['id-t1'], 'the token stays pending');
    assert.deepEqual(await query(url, 'SELECT count(*)::int AS tokens FROM enrollment_tokens'), [{ tokens: 1 }]);
  } finally {
    await query(url, 'DROP TRIGGER IF EXISTS fail_rotation_link ON enrollment_tokens');
    await query(url, 'DROP FUNCTION IF EXISTS fail_rotation_link()');
  }
});

// Connects a holder and an observer; when one attempt fails, the other
// client is ended once it settles, so no connection stays open.
async function connectedPair(): Promise<[pg.Client, pg.Client]> {
  const clients = [new pg.Client({ connectionString: url.href }), new pg.Client({ connectionString: url.href })] as const;
  const connections = await Promise.allSettled(clients.map((client) => client.connect()));
  const failure = connections.find((connection) => connection.status === 'rejected');
  if (failure === undefined) return [...clients];
  await Promise.allSettled(clients.filter((_, index) => connections[index]!.status === 'fulfilled').map((client) => client.end()));
  throw failure.reason;
}

async function backendPid(client: pg.Client): Promise<number> {
  return (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
}

// Polls `isWaiting` until it holds. Handles `call` at once, so its error is
// never unhandled; if `call` settles first, fails with its error or result.
async function waitUntilWaiting(call: Promise<unknown>, isWaiting: () => Promise<boolean>, failure: string): Promise<void> {
  let settled = false;
  call.then(() => { settled = true; }, () => { settled = true; });
  for (let tries = 0; tries < 500; tries++) {
    if (await isWaiting()) return;
    if (settled) throw new Error(`${failure}: the call ended first with ${inspect(await call)}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(failure);
}

// Counts the waiters that the holder blocks, directly or, for a later one
// queued for the same row, through an earlier waiter.
function waitForLockWaiters(call: Promise<unknown>, observer: pg.Client, holderPid: number, count: number): Promise<void> {
  return waitUntilWaiting(call, async () => {
    const { rows } = await observer.query<{ waiting: number }>(
      `WITH RECURSIVE blocked (pid) AS (
         SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND $1 = ANY(pg_blocking_pids(pid))
         UNION
         SELECT waiter.pid FROM pg_stat_activity waiter JOIN blocked ON blocked.pid = ANY(pg_blocking_pids(waiter.pid))
           WHERE waiter.datname = current_database()
       ) SELECT count(*)::int AS waiting FROM blocked`,
      [holderPid],
    );
    return rows[0]!.waiting >= count;
  }, `fewer than ${count} statements wait for the token row`);
}

// Polled outside any transaction, which would keep the backends and query
// texts of its first read of the activity view and miss a later waiter.
function waitForWaitingStatement(call: Promise<unknown>, observer: pg.Client, role: string, statement: string): Promise<void> {
  return waitUntilWaiting(call, async () => {
    const { rows } = await observer.query<{ waiting: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()
         AND usename = $1 AND query LIKE $2) AS waiting`,
      [role, statement],
    );
    return rows[0]!.waiting;
  }, `no statement like ${statement} waited for the row lock`);
}

test('a publisher that waited for the lock pushes every entry committed meanwhile', { concurrency: false }, async () => {
  await truncateAll(url);
  const registry = new CommittingFleetRegistry(database);
  for (const [workerId, journalId] of [['w1', 'j1'], ['w2', 'j2']] as const) {
    value(await registry.addToken(fleetToken(`t-${workerId}`)));
    value(await registry.enroll(fleetToken(`t-${workerId}`).hash, fleetWorker(workerId, journalId)));
  }
  value(await registry.revoke(fleetWorker('w1', 'j1').workerId, fleetWorker('w1', 'j1').enrolledAt));
  const [holder, observer] = await connectedPair();
  const pushes: string[][] = [];
  const push = async (revocations: readonly { userKey: string }[]) => {
    pushes.push(revocations.map((revocation) => revocation.userKey));
    return ok(undefined);
  };
  let publishing: ReturnType<CommittingFleetRegistry['publishRevocations']> | undefined;
  try {
    await holder.query('SELECT pg_advisory_lock(1792930400)');
    publishing = registry.publishRevocations(push);
    await waitForWaitingLock(publishing, observer);
    value(await registry.revoke(fleetWorker('w2', 'j2').workerId, fleetWorker('w2', 'j2').enrolledAt));
    await holder.query('SELECT pg_advisory_unlock(1792930400)');
    assert.equal(value(await publishing), 2);
    assert.deepEqual(pushes, [['U-w1-1', 'U-w2-1']]);
    assert.equal(value(await registry.publishRevocations(push)), 0);
  } finally {
    // Releases the lock also after a failed step; a repeat release is a no-op.
    await Promise.allSettled([holder.query('SELECT pg_advisory_unlock_all()')]);
    await Promise.allSettled([holder.end(), observer.end()]);
    await Promise.allSettled([publishing]);
  }
});

test('a renewal that waits for the row lock until past the deadline is refused', { concurrency: false }, async () => {
  await truncateAll(url);
  const registry = new CommittingFleetRegistry(database);
  const worker = fleetWorker('w1', 'j1');
  await enrollAll(registry, worker);
  const deadline = value(parseInstant(new Date(Date.parse(worker.enrolledAt) + 600_000).toISOString()));
  value(await registry.requestRotation(worker.workerId, { requestedAt: worker.enrolledAt, deadline, actor: 'ops', reason: 'test' }));
  let now = worker.enrolledAt;
  const [holder, observer] = await connectedPair();
  let renewing: ReturnType<CommittingFleetRegistry['renew']> | undefined;
  try {
    await holder.query('BEGIN');
    await holder.query("SELECT 1 FROM workers WHERE worker_id = 'w1' FOR UPDATE");
    renewing = registry.renew(worker.workerId, nextGeneration(worker), 'jwt', { now: () => now });
    await waitForWaitingStatement(renewing, observer, url.username, 'SELECT enrollment FROM workers %FOR UPDATE');
    now = deadline;
    await holder.query('COMMIT');
    const late = await renewing;
    assert.deepEqual(!late.ok && [late.error.code, late.error.details.reason], ['forbidden', 'rotation-expired']);
    assert.equal(value(await registry.worker(worker.workerId))?.credentials.rotation?.brokerUserJwt, undefined);
    assert.deepEqual(value(await registry.unrenewedRotations(deadline)), [worker.workerId]);
  } finally {
    // A ROLLBACK outside a transaction only warns, so it is safe after COMMIT.
    await Promise.allSettled([holder.query('ROLLBACK')]);
    await Promise.allSettled([holder.end(), observer.end()]);
    await Promise.allSettled([renewing]);
  }
});

// The bigint key 1792930400 of the lock: high half `classid`, low half
// `objid`, and `objsubid` 1, which tells it from a key of two integers.
function waitForWaitingLock(call: Promise<unknown>, observer: pg.Client): Promise<void> {
  return waitUntilWaiting(call, async () => {
    const { rows } = await observer.query<{ waiting: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND classid = 0 AND objid = 1792930400
         AND objsubid = 1 AND NOT granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database())) AS waiting`,
    );
    return rows[0]!.waiting;
  }, 'the publisher never waited for the advisory lock');
}

async function enrollAll(registry: CommittingFleetRegistry, ...workers: ReturnType<typeof fleetWorker>[]): Promise<void> {
  for (const worker of workers) {
    value(await registry.addToken(fleetToken(`t-${worker.workerId}`)));
    value(await registry.enroll(fleetToken(`t-${worker.workerId}`).hash, worker));
  }
}

function nextGeneration(worker: ReturnType<typeof fleetWorker>): CredentialGeneration {
  const first = worker.credentials.current;
  return {
    ...first,
    generation: 2,
    controlPlaneHash: `${first.controlPlaneHash}-next` as CredentialGeneration['controlPlaneHash'],
    brokerUserKey: `U-${worker.workerId}-2`,
  };
}

// The registry's two steps that make `next` current and keep generation 1
// as the predecessor until `deadline`; the renewal is just before it.
async function renewed(registry: CommittingFleetRegistry, worker: EnrolledWorker, next: CredentialGeneration, deadline: Instant) {
  const order = { requestedAt: worker.enrolledAt, deadline, actor: 'ops', reason: 'test' };
  value(await registry.requestRotation(worker.workerId, order));
  const renewedAt = value(parseInstant(new Date(Date.parse(deadline) - 1).toISOString()));
  value(await registry.renew(worker.workerId, next, 'jwt', { now: () => renewedAt }));
}

const predecessorColumn = (workerId: string) =>
  query<{ enrollment: string; predecessor_valid_until: Date | null }>(
    url,
    'SELECT enrollment, predecessor_valid_until FROM workers WHERE worker_id = $1',
    [workerId],
  );

test('a due row whose record holds no predecessor is cleared, and the sweep goes on', { concurrency: false }, async () => {
  await truncateAll(url);
  const registry = new CommittingFleetRegistry(database);
  const [skipped, rotated] = [fleetWorker('w1', 'j1'), fleetWorker('w2', 'j2')];
  await enrollAll(registry, skipped, rotated);
  const next = nextGeneration(rotated);
  await renewed(registry, rotated, next, rotated.enrolledAt);
  await query(url, "UPDATE workers SET predecessor_valid_until = $1 WHERE worker_id = 'w1'", [rotated.enrolledAt]);
  const [before] = await predecessorColumn('w1');

  assert.equal(value(await registry.expirePredecessors(rotated.enrolledAt)), 1, 'only the real predecessor counts');
  assert.deepEqual(value(await registry.worker(rotated.workerId))?.credentials, { current: next });
  assert.deepEqual(await predecessorColumn('w1'), [{ enrollment: before!.enrollment, predecessor_valid_until: null }], 'the column is cleared, the record kept');
  assert.deepEqual(await query(url, 'SELECT user_key FROM broker_revocations'), [{ user_key: 'U-w2-1' }]);

  const [cleared] = await predecessorColumn('w1');
  assert.equal(value(await registry.expirePredecessors(rotated.enrolledAt)), 0, 'a second sweep meets nothing');
  assert.deepEqual(await predecessorColumn('w1'), [cleared], 'and leaves the cleared row alone');
});

test('a due row without an enrollment record is not swept', { concurrency: false }, async () => {
  await truncateAll(url);
  const registry = new CommittingFleetRegistry(database);
  const [bare, rotated] = [fleetWorker('w1', 'j1'), fleetWorker('w2', 'j2')];
  await enrollAll(registry, bare, rotated);
  await renewed(registry, rotated, nextGeneration(rotated), rotated.enrolledAt);
  await query(url, "UPDATE workers SET enrollment = NULL, predecessor_valid_until = $1 WHERE worker_id = 'w1'", [rotated.enrolledAt]);
  const before = await predecessorColumn('w1');

  assert.equal(value(await registry.expirePredecessors(rotated.enrolledAt)), 1, 'the other worker still expires');
  assert.deepEqual(await predecessorColumn('w1'), before, 'the row without a record is left as it was');
  assert.deepEqual(await query(url, 'SELECT user_key FROM broker_revocations'), [{ user_key: 'U-w2-1' }]);
});

test('a due row whose predecessor is still in its grace window expires nothing yet', { concurrency: false }, async () => {
  await truncateAll(url);
  const registry = new CommittingFleetRegistry(database);
  const worker = fleetWorker('w1', 'j1');
  await enrollAll(registry, worker);
  const graceEnds = value(parseInstant(new Date(Date.parse(worker.enrolledAt) + 600_000).toISOString()));
  await renewed(registry, worker, nextGeneration(worker), graceEnds);
  await query(url, "UPDATE workers SET predecessor_valid_until = $1 WHERE worker_id = 'w1'", [worker.enrolledAt]);

  assert.equal(value(await registry.expirePredecessors(worker.enrolledAt)), 0, 'the record, not the column, decides');
  assert.equal(value(await registry.worker(worker.workerId))?.credentials.previous?.validUntil, graceEnds);
  const [row] = await predecessorColumn('w1');
  assert.equal(row!.predecessor_valid_until?.toISOString(), graceEnds, 'the column is set back to the record');
  assert.deepEqual(await query(url, 'SELECT user_key FROM broker_revocations'), []);
  assert.equal(value(await registry.expirePredecessors(graceEnds)), 1, 'it expires when its grace window ends');
});

test('the initialized installation is not quarantined', { concurrency: false }, async () => {
  await truncateAll(url);
  const guard = () => database.transaction(async (tx) => ({ ok: true as const, value: await tx.installation.quarantined() }));
  assert.equal(value(await guard()), true, 'an uninitialized installation admits nothing');
  value(await new CommittingInstallationTable(database).initialize(value(installationIdentity('install-1', 1))));
  assert.equal(value(await guard()), false);
});

test('audit events cannot be changed or removed', { concurrency: false }, async () => {
  await truncateAll(url);
  for (const conformance of OPERATOR_CREDENTIALS_CONFORMANCE.slice(1, 2)) await conformance.check(new CommittingOperatorCredentials(database));
  await assert.rejects(query(url, "UPDATE audit_events SET reason = 'changed'"), /audit events are immutable/);
  await assert.rejects(query(url, 'DELETE FROM audit_events'), /audit events are immutable/);
});

test('a hash column refuses a second worker, and a row without a record is no worker', { concurrency: false }, async () => {
  await truncateAll(url);
  const registry = new CommittingFleetRegistry(database);
  value(await registry.addToken(fleetToken('t1')));
  const worker = fleetWorker('w1', 'j1');
  value(await registry.enroll(fleetToken('t1').hash, worker));
  const hash = worker.credentials.current.controlPlaneHash;
  await assert.rejects(query(url, `INSERT INTO workers (worker_id, enrolled, revoked, draining, reachable, slots, cpu_millicores,
    memory_mebibytes, controls, control_plane_hash) VALUES ('w2', true, false, false, false, 1, 1, 1, '{}', $1)`, [hash]), /unique/);
  await query(url, `INSERT INTO workers (worker_id, enrolled, revoked, draining, reachable, slots, cpu_millicores,
    memory_mebibytes, controls, control_plane_hash) VALUES ('w3', true, false, false, false, 1, 1, 1, '{}', 'cp-orphan')`);
  assert.equal(value(await registry.workerByCredentialHash('cp-orphan' as never)), undefined);
});
