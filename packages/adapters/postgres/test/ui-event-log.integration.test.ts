import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { OwnerBootstrapService, PrincipalAdministration, ProjectSetupService, type PasswordHasher, type PrincipalId } from '@taskelith/access';
import { UI_EVENT_LOG_CONFORMANCE, projectScope, type CommittedEntry, type PrincipalId as ReaderId, type UiEvent } from '@taskelith/execution';
import type { ProjectId } from '@taskelith/sdlc';
import { err, failure, ok } from '@taskelith/kernel';
import { PostgresAccessStore, PostgresDatabase, PostgresUiEventLog, PostgresUiEventNotifications } from '@taskelith/postgres';
import { NodeSecrets } from '@taskelith/secrets';
import { value } from '@taskelith/testing';
import { AT } from './fixtures.ts';
import { createMigratedDatabase, query, truncateAll } from './test-database.ts';

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

async function commit(entries: readonly CommittedEntry[]): Promise<void> {
  value(await database.transaction(async (tx) => {
    for (const entry of entries) {
      const written = entry.kind === 'event' ? await tx.uiEvents.append(entry.event) : await tx.access.changes.record(entry.change as never);
      if (!written.ok) return written;
    }
    return ok(undefined);
  }));
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

test('positions follow the order of commit, not of insertion: an entry committed later gets the higher position', async () => {
  const inserted = gate();
  const release = gate();
  const early = database.transaction(async (tx) => {
    value(await tx.uiEvents.append(outputEvent(1)));
    inserted.open();
    await release.opened;
    return ok(undefined);
  });
  await inserted.opened;
  await commit([{ kind: 'event', event: outputEvent(2) }]);
  value(await log.assign(100, AT));
  release.open();
  value(await early);
  value(await log.assign(100, AT));
  assert.deepEqual(await marks(), ['1:2', '2:1']);
  const [row] = await query<{ entry_order: string }>(url, 'SELECT string_agg(entry_id::text, \',\' ORDER BY position) AS entry_order FROM ui_events');
  const [first, second] = row!.entry_order.split(',').map(Number);
  assert.ok(first! > second!, 'the entry inserted first was numbered second');
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
  value(await log.assign(100, AT));
  assert.deepEqual(await changesOf(owner), [{ change: 'roles-changed', principalId: owner }]);
  assert.deepEqual(await changesOf(bob), [{ change: 'roles-changed', principalId: bob, projectId }]);
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
  value(await log.assign(100, AT));
  await numbered.opened;
  await notifications.close();
  assert.equal(await notifications.listen(), false, 'a closed listener stays closed');
});
