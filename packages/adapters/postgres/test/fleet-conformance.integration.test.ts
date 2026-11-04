import assert from 'node:assert/strict';
import { after, test } from 'node:test';
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
  const [holder, observer] = [new pg.Client({ connectionString: url.href }), new pg.Client({ connectionString: url.href })];
  await Promise.all([holder.connect(), observer.connect()]);
  let enrolling: Promise<Result<void>> | undefined;
  try {
    await holder.query('BEGIN');
    await holder.query("SELECT 1 FROM enrollment_tokens WHERE secret_hash = 't1' FOR UPDATE");
    enrolling = registry.enroll(fleetToken('t1').hash, fleetWorker('w1', 'j1'));
    await waitForWaitingStatement(observer, steppedClock.credentials.username, 'UPDATE enrollment_tokens %');
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
  const [holder, observer] = [new pg.Client({ connectionString: url.href }), new pg.Client({ connectionString: url.href })];
  await Promise.all([holder.connect(), observer.connect()]);
  let rotating: Promise<Result<void>> | undefined;
  try {
    await holder.query('BEGIN');
    await holder.query("SELECT 1 FROM enrollment_tokens WHERE token_id = 'id-t1' FOR UPDATE");
    rotating = registry.rotateToken('id-t1', fleetToken('t2'), AT);
    await waitForWaitingStatement(observer, steppedClock.credentials.username, 'SELECT used_at%');
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
  const [holder, observer] = [new pg.Client({ connectionString: url.href }), new pg.Client({ connectionString: url.href })];
  await Promise.all([holder.connect(), observer.connect()]);
  let racing: Promise<[A, B]> | undefined;
  try {
    await holder.query('BEGIN');
    await holder.query("SELECT 1 FROM enrollment_tokens WHERE token_id = 'id-t1' FOR UPDATE");
    racing = Promise.all([first(), waitForLockWaiters(observer, 1).then(second)]);
    await waitForLockWaiters(observer, 2);
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

async function waitForLockWaiters(client: pg.Client, count: number): Promise<void> {
  for (let tries = 0; tries < 500; tries++) {
    const { rows } = await client.query<{ waiting: string }>(
      `SELECT count(*) AS waiting FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()
         AND query LIKE '%enrollment_tokens%'`,
    );
    if (Number(rows[0]?.waiting) >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`fewer than ${count} statements wait for the token row`);
}

// Polled outside any transaction: a snapshot of the activity view is kept
// for a transaction's duration.
async function waitForWaitingStatement(client: pg.Client, role: string, statement: string): Promise<void> {
  for (let tries = 0; tries < 500; tries++) {
    const { rows } = await client.query<{ waiting: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()
         AND usename = $1 AND query LIKE $2) AS waiting`,
      [role, statement],
    );
    if (rows[0]!.waiting) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`no statement like ${statement} waited for the row lock`);
}

test('a publisher that waited for the lock pushes every entry committed meanwhile', { concurrency: false }, async () => {
  await truncateAll(url);
  const registry = new CommittingFleetRegistry(database);
  for (const [workerId, journalId] of [['w1', 'j1'], ['w2', 'j2']] as const) {
    value(await registry.addToken(fleetToken(`t-${workerId}`)));
    value(await registry.enroll(fleetToken(`t-${workerId}`).hash, fleetWorker(workerId, journalId)));
  }
  value(await registry.revoke(fleetWorker('w1', 'j1').workerId, fleetWorker('w1', 'j1').enrolledAt));
  const holder = new pg.Client({ connectionString: url.href });
  await holder.connect();
  await holder.query('SELECT pg_advisory_lock(1792930400)');
  const pushes: string[][] = [];
  const push = async (revocations: readonly { userKey: string }[]) => {
    pushes.push(revocations.map((revocation) => revocation.userKey));
    return ok(undefined);
  };
  const publishing = registry.publishRevocations(push);
  // The barrier: the publisher is waiting for the advisory lock.
  await waitForWaitingLock(holder);
  value(await registry.revoke(fleetWorker('w2', 'j2').workerId, fleetWorker('w2', 'j2').enrolledAt));
  await holder.query('SELECT pg_advisory_unlock(1792930400)');
  await holder.end();

  assert.equal(value(await publishing), 2);
  assert.deepEqual(pushes, [['U-w1-1', 'U-w2-1']]);
  assert.equal(value(await registry.publishRevocations(push)), 0);
});

test('a renewal that waits for the row lock until past the deadline is refused', { concurrency: false }, async () => {
  await truncateAll(url);
  const registry = new CommittingFleetRegistry(database);
  const worker = fleetWorker('w1', 'j1');
  await enrollAll(registry, worker);
  const deadline = value(parseInstant(new Date(Date.parse(worker.enrolledAt) + 600_000).toISOString()));
  value(await registry.requestRotation(worker.workerId, { requestedAt: worker.enrolledAt, deadline, actor: 'ops', reason: 'test' }));
  let now = worker.enrolledAt;
  const holder = new pg.Client({ connectionString: url.href });
  await holder.connect();
  await holder.query('BEGIN');
  await holder.query("SELECT 1 FROM workers WHERE worker_id = 'w1' FOR UPDATE");
  const renewing = registry.renew(worker.workerId, nextGeneration(worker), 'jwt', { now: () => now });
  // The barrier: the renewal is waiting for the row lock.
  await waitForWaitingRowLock(holder);
  now = deadline;
  await holder.query('COMMIT');
  await holder.end();

  const late = await renewing;
  assert.deepEqual(!late.ok && [late.error.code, late.error.details.reason], ['forbidden', 'rotation-expired']);
  assert.equal(value(await registry.worker(worker.workerId))?.credentials.rotation?.brokerUserJwt, undefined);
  assert.deepEqual(value(await registry.unrenewedRotations(deadline)), [worker.workerId]);
});

async function waitForWaitingRowLock(client: pg.Client): Promise<void> {
  for (let tries = 0; tries < 200; tries++) {
    const { rows } = await client.query<{ waiting: number }>(
      `SELECT count(*)::int AS waiting FROM pg_stat_activity
         WHERE wait_event_type = 'Lock' AND datname = current_database() AND pid <> pg_backend_pid()`,
    );
    if (rows[0]!.waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('the renewal never waited for the row lock');
}

async function waitForWaitingLock(client: pg.Client): Promise<void> {
  for (let tries = 0; tries < 200; tries++) {
    const { rows } = await client.query<{ waiting: number }>(
      `SELECT count(*)::int AS waiting FROM pg_locks WHERE locktype = 'advisory' AND objid = 1792930400 AND NOT granted
         AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
    );
    if (rows[0]!.waiting > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('the publisher never waited for the advisory lock');
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
