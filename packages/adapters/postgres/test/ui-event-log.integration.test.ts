import assert from 'node:assert/strict';
import { after, beforeEach, test, type TestContext } from 'node:test';
import { OwnerBootstrapService, PrincipalAdministration, ProjectSetupService, type PasswordHasher, type PrincipalId } from '@taskelith/access';
import { UI_EVENT_LOG_CONFORMANCE, projectScope, type CommittedEntry, type PrincipalId as ReaderId, type UiEvent } from '@taskelith/execution';
import type { ProjectId } from '@taskelith/sdlc';
import { err, failure, ok } from '@taskelith/kernel';
import { PostgresAccessStore, PostgresDatabase, PostgresUiEventLog, PostgresUiEventNotifications } from '@taskelith/postgres';
import { InMemoryLogSink, Logger } from '@taskelith/observability';
import { NodeSecrets } from '@taskelith/secrets';
import { value } from '@taskelith/testing';
import { AT } from './fixtures.ts';
import { createMigratedDatabase, query, truncateAll, untilNumberable } from './test-database.ts';

const url = await createMigratedDatabase();
const database = new PostgresDatabase(url);
const log = new PostgresUiEventLog(database);
after(() => database.close());
beforeEach(() => truncateAll(url));

const ALPHA = 'alpha' as ProjectId;
const ALPHA_STREAM = { scope: projectScope(ALPHA) };
const INVOCATION = { actor: 'root@control-plane-1', reason: 'event log test' };

function outputEvent(mark: number): UiEvent {
  const entry = { position: mark, turnId: 't-1', generation: 1, text: `entry ${mark}` } as never;
  return { scope: projectScope(ALPHA), occurredAt: AT, record: { type: 'output-appended', sessionId: 's-1' as never, entry } };
}

// Commits the entries in a transaction of their own.
async function commitNow(entries: readonly CommittedEntry[]): Promise<void> {
  value(await database.transaction(async (tx) => {
    for (const entry of entries) {
      const written = entry.kind === 'event' ? await tx.uiEvents.append(entry.event) : await tx.access.changes.record(entry.change as never);
      if (!written.ok) return written;
    }
    return ok(undefined);
  }));
}

// Commits the entries and settles once the assigner can number them.
async function commit(entries: readonly CommittedEntry[]): Promise<void> {
  await commitNow(entries);
  await untilNumberable(url);
}

async function marks(): Promise<readonly string[]> {
  const { head } = value(await log.bounds());
  const entries = value(await log.readAfter(0, head, ALPHA_STREAM, 1_000));
  return entries.map((entry) => `${entry.position}:${entry.kind === 'event' ? (entry.event.record as { entry: { position: number } }).entry.position : 'change'}`);
}

for (const conformance of UI_EVENT_LOG_CONFORMANCE) {
  test(`PostgreSQL UI event log: ${conformance.name}`, { concurrency: false }, async () => {
    await truncateAll(url);
    assert.deepEqual(await conformance.check({ log, commit }), []);
  });
}

// A gate that one party opens and another awaits.
function gate(): { opened: Promise<void>; open(): void } {
  let open!: () => void;
  const opened = new Promise<void>((resolve) => { open = resolve; });
  return { opened, open };
}

// A transaction that appended its entries and stays open until released,
// at the latest when the test ends.
async function heldOpen(t: TestContext, ...events: readonly UiEvent[]) {
  const inserted = gate();
  const release = gate();
  const done = database.transaction(async (tx) => {
    for (const event of events) value(await tx.uiEvents.append(event));
    inserted.open();
    await release.opened;
    return ok(undefined);
  });
  const commit = async () => (release.open(), value(await done));
  t.after(commit);
  await inserted.opened;
  return { commit };
}

test('an entry committed while an earlier inserter is open waits for it, then both are numbered in insertion order', async (t) => {
  const early = await heldOpen(t, outputEvent(1));
  await commitNow([{ kind: 'event', event: outputEvent(2) }]);
  assert.equal(value(await log.assign(100, AT)), 0, 'the later commit is not numbered while the earlier inserter is open');
  const seen = value(await log.bounds()).head;
  await early.commit();
  await untilNumberable(url);
  assert.equal(value(await log.assign(100, AT)), 2);
  assert.equal(seen, 0, 'a reader saw no position while the earlier inserter was open');
  assert.deepEqual(await marks(), ['1:1', '2:2'], 'positions follow insertion, all above what the reader saw');
});

test('entries inserted in one order and committed in the other before any numbering are numbered in insertion order', async (t) => {
  const early = await heldOpen(t, outputEvent(1));
  await commitNow([{ kind: 'event', event: outputEvent(2) }]);
  await early.commit();
  await untilNumberable(url);
  value(await log.assign(100, AT));
  assert.deepEqual(await marks(), ['1:1', '2:2']);
});

test('a long-open transaction delays numbering but neither blocks other writers\' inserts and commits nor loses their order', async (t) => {
  const long = await heldOpen(t, outputEvent(1));
  for (const mark of [2, 3, 4]) {
    await commitNow([{ kind: 'event', event: outputEvent(mark) }]);
    assert.equal(value(await log.assign(100, AT)), 0, `commit ${mark} waits for the long transaction`);
  }
  await long.commit();
  await untilNumberable(url);
  assert.equal(value(await log.assign(100, AT)), 4);
  assert.deepEqual(await marks(), ['1:1', '2:2', '3:3', '4:4']);
});

test('a rolled-back transaction leaves no entry, and concurrent numberings give each committed entry one position without gaps', async () => {
  const rolledBack = await database.transaction(async (tx) => {
    value(await tx.uiEvents.append(outputEvent(99)));
    return err(failure('conflict', 'rolled back'));
  });
  assert.equal(rolledBack.ok, false);
  for (let mark = 1; mark <= 40; mark++) await commit([{ kind: 'event', event: outputEvent(mark) }]);
  const counts = await Promise.all(Array.from({ length: 4 }, () => log.assign(7, AT)));
  const more = await Promise.all(Array.from({ length: 4 }, () => log.assign(7, AT)));
  const numbered = [...counts, ...more].reduce((sum, count) => sum + value(count), 0);
  assert.equal(numbered + value(await log.assign(100, AT)), 40);
  const read = await marks();
  assert.deepEqual(read.map((mark) => Number(mark.split(':')[0])), Array.from({ length: 40 }, (_, index) => index + 1));
  assert.equal(new Set(read.map((mark) => mark.split(':')[1])).size, 40);
  assert.deepEqual(value(await log.bounds()), { floor: 0, head: 40 });
});

// Role commands hash no password.
const NO_HASHER: PasswordHasher = {
  hash: async () => err(failure('internal', 'no password is hashed here')),
  verify: async () => err(failure('internal', 'no password is verified here')),
};
const DEFAULTS = Object.freeze({
  frameworkPluginId: 'sdlc-openspec', implementers: ['agent-primary'], reviewer: 'agent-secondary',
  specApprover: 'project-maintainer', noEligibleSlot: 'wait',
} as const);

async function changesOf(principalId: PrincipalId): Promise<readonly unknown[]> {
  const entries = value(await log.readAfter(0, value(await log.bounds()).head, ALPHA_STREAM_OF(principalId), 100));
  return entries.flatMap((entry) => (entry.kind === 'principal-change' ? [entry.change] : []));
}

const ALPHA_STREAM_OF = (principalId: PrincipalId) => ({ scope: projectScope(ALPHA), principalId: principalId as string as ReaderId });

test('Access records role changes into the log in the transaction of the change, and a refused command none', async () => {
  const store = new PostgresAccessStore(database);
  const secrets = new NodeSecrets();
  const clock = { now: () => AT };
  const owner = value(await new OwnerBootstrapService({ store, random: secrets, clock }).ensureOwner(INVOCATION)).principalId;
  const admin = new PrincipalAdministration({ store, hasher: NO_HASHER, random: secrets, clock });
  const setup = new ProjectSetupService({ store, random: secrets, clock });
  const { projectId } = value(await setup.createProject(owner, { name: 'Alpha', defaults: DEFAULTS }, INVOCATION));
  const bob = value(await admin.createPrincipal(owner, 'bob', INVOCATION)).principalId;
  value(await admin.assignProjectMember(owner, { projectId, principalId: bob, role: 'project-viewer' }, INVOCATION));
  const refused = await admin.assignProjectMember(bob, { projectId, principalId: bob, role: 'project-maintainer' }, INVOCATION);
  assert.equal(refused.ok, false);
  await untilNumberable(url);
  value(await log.assign(100, AT));
  assert.deepEqual(await changesOf(owner), [{ change: 'roles-changed', principalId: owner }]);
  assert.deepEqual(await changesOf(bob), [{ change: 'roles-changed', principalId: bob, projectId }]);
});

test('an event inserted before a role revocation commits but committed after it is numbered before the revocation', async (t) => {
  const store = new PostgresAccessStore(database);
  const secrets = new NodeSecrets();
  const clock = { now: () => AT };
  const owner = value(await new OwnerBootstrapService({ store, random: secrets, clock }).ensureOwner(INVOCATION)).principalId;
  const admin = new PrincipalAdministration({ store, hasher: NO_HASHER, random: secrets, clock });
  const setup = new ProjectSetupService({ store, random: secrets, clock });
  const { projectId } = value(await setup.createProject(owner, { name: 'Alpha', defaults: DEFAULTS }, INVOCATION));
  const bob = value(await admin.createPrincipal(owner, 'bob', INVOCATION)).principalId;
  value(await admin.assignProjectMember(owner, { projectId, principalId: bob, role: 'project-viewer' }, INVOCATION));
  await untilNumberable(url);
  value(await log.assign(100, AT));
  const opened = value(await log.bounds()).head;
  const record = { type: 'board-changed', workersOnline: 7 } as const;
  const concurrent = await heldOpen(t, { scope: projectScope(projectId as string as ProjectId), occurredAt: AT, record });
  value(await admin.removeProjectMember(owner, { projectId, principalId: bob }, INVOCATION));
  assert.equal(value(await log.assign(100, AT)), 0, 'the committed revocation waits for the open event');
  await concurrent.commit();
  await untilNumberable(url);
  assert.equal(value(await log.assign(100, AT)), 2);
  const filter = { scope: projectScope(projectId as string as ProjectId), principalId: bob as string as ReaderId };
  const read = value(await log.readAfter(opened, value(await log.bounds()).head, filter, 100));
  assert.deepEqual(read.map((entry) => entry.kind), ['event', 'principal-change'], 'the reader gets the event, then its stream-ended');
});

test('a commit that appends entries and a numbering each wake the listeners of their channel', async () => {
  const notifications = new PostgresUiEventNotifications(url);
  after(() => notifications.close());
  assert.equal(await notifications.listen(), true);
  const appended = gate();
  const numbered = gate();
  notifications.onAppended(() => appended.open());
  notifications.onNumbered(() => numbered.open());
  await commit([{ kind: 'event', event: outputEvent(1) }]);
  await appended.opened;
  await untilNumberable(url);
  value(await log.assign(100, AT));
  await numbered.opened;
  await notifications.close();
  assert.equal(await notifications.listen(), false, 'a closed listener stays closed');
});

test('a listener that cannot connect answers false and logs the loss, a close during the connect keeps it closed, and a removed listener hears nothing', async () => {
  const logs = new InMemoryLogSink();
  const unreachable = new URL(url.href);
  unreachable.port = '1';
  const failing = new PostgresUiEventNotifications(unreachable, new Logger(logs, { now: () => AT }));
  assert.equal(await failing.listen(), false);
  assert.ok(logs.records.some((record) => record.event === 'postgres.events.listen.lost'));
  const closing = new PostgresUiEventNotifications(url);
  const connecting = closing.listen();
  await closing.close();
  assert.equal(await connecting, false);
  const notifications = new PostgresUiEventNotifications(url);
  after(() => notifications.close());
  let heard = 0;
  const stop = notifications.onAppended(() => heard++);
  notifications.onNumbered(() => heard++)();
  stop();
  const numbered = gate();
  notifications.onNumbered(() => numbered.open());
  assert.equal(await notifications.listen(), true);
  assert.equal(await notifications.listen(), true, 'an open listener stays open');
  await commit([{ kind: 'event', event: outputEvent(1) }]);
  await untilNumberable(url);
  value(await log.assign(100, AT));
  await numbered.opened;
  assert.equal(heard, 0);
});

test('a listener whose connection is lost logs it, and the next listen reconnects and hears again', async () => {
  const logs = new InMemoryLogSink();
  const notifications = new PostgresUiEventNotifications(url, new Logger(logs, { now: () => AT }));
  after(() => notifications.close());
  assert.equal(await notifications.listen(), true);
  const lost = gate();
  const watch = setInterval(() => { if (logs.records.some((record) => record.event === 'postgres.events.listen.lost')) lost.open(); }, 50);
  await query(url, "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE query LIKE 'LISTEN %' AND pid <> pg_backend_pid()");
  await lost.opened;
  clearInterval(watch);
  const numbered = gate();
  notifications.onNumbered(() => numbered.open());
  assert.equal(await notifications.listen(), true);
  await commit([{ kind: 'event', event: outputEvent(1) }]);
  await untilNumberable(url);
  value(await log.assign(100, AT));
  await numbered.opened;
});
