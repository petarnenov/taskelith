import assert from 'node:assert/strict';
import { after, afterEach, describe, test } from 'node:test';
import { SeededRandom, Toxiproxy, acquireProcessLock, integrationEndpoint, rerunHint, seedFromEnvironment, value } from '@taskelith/testing';
import { OrderedAuthority } from './g2-scenarios/ordered-authority.ts';
import { recordScenario, withInstallation } from './g2-scenarios/scenario-run.ts';
import { REDELIVERY_BUDGET_MILLISECONDS, SCENARIO_LIMITS, ScenarioInstallation } from './g2-scenarios/scenario-installation.ts';
import { ScenarioWorker } from './g2-scenarios/scenario-worker.ts';
import { assertExitedOnce, journaledState, reachable, startedExecutions } from './g2-scenarios/scenario-reads.ts';
import { Gate, waitFor } from './g2-scenarios/waiting.ts';

// G2 item 24c: partition and reconnect through Toxiproxy, of the worker's
// broker connection and of the control plane's PostgreSQL connection.
const SEED = seedFromEnvironment();
const toxiproxyUrl = integrationEndpoint('TASKELITH_TOXIPROXY_URL');
const toxiproxy = new Toxiproxy(toxiproxyUrl);
// Other test files partition the same Toxiproxy, so this one waits its turn.
const release = await acquireProcessLock(`toxiproxy-${toxiproxyUrl.port}`);
after(release);
afterEach(() => toxiproxy.reset());
console.log(`g2 partition scenarios: ${rerunHint(SEED)}`);
const INVENTORY_LOOP = 'product bug: inventory request loop after a reconnect (openspec/changes/run-g2-partition-and-races/verification.md)';
const SETTLE_MILLISECONDS = 3_000;

// One intent per offered assignment, however often it was offered.
async function assertOneIntentPerAssignment(installation: ScenarioInstallation, worker: ScenarioWorker): Promise<number> {
  const offers = (await installation.commandsTo(worker.workerId)).filter(({ type }) => type === 'execution.assignment.offer');
  const assignments = new Set(offers.map(({ payload }) => payload.assignmentId));
  assert.equal(value(worker.running.root.journal.snapshot()).intents.length, assignments.size, 'one intent per assignment');
  return offers.length;
}

describe('worker to NATS', () => {
  const nats = toxiproxy.proxy('nats');
  const proxied = integrationEndpoint('TASKELITH_NATS_PROXY_URL');

  async function connectedWorker(installation: ScenarioInstallation, name: string, random: SeededRandom): Promise<ScenarioWorker> {
    const worker = new ScenarioWorker(installation, {
      name, random, nats: proxied, runMilliseconds: 2_500, enrollmentToken: await installation.enrollmentToken(),
    });
    await worker.start();
    await waitFor(() => reachable(installation, worker.workerId), 20_000, 'the worker is reachable');
    return worker;
  }

  // Seed: whether the task is submitted before or after the control plane
  // marks the partitioned worker lost; either way it runs once after heal.
  test('a partition before the offer delays it, and the worker runs it once after the heal', { timeout: 90_000 }, async () => {
    const random = new SeededRandom(SEED);
    const submitAfterLostContact = random.nextInt(2) === 1;
    await recordScenario({ scenario: 'partition-worker-nats-before-offer', seed: SEED }, () => withInstallation({ postgres: 'direct', toxiproxy }, async (installation) => {
      const worker = await connectedWorker(installation, 'nats-before-offer', random);
      try {
        await nats.disconnect();
        if (!submitAfterLostContact) await installation.submitTask('task-nats-offer');
        await waitFor(async () => !(await reachable(installation, worker.workerId)), 20_000, 'the control plane marks the worker lost');
        await waitFor(() => worker.logs.records.some(({ event }) => event === 'worker.contact.offline'), 20_000, 'the worker is offline');
        if (submitAfterLostContact) await installation.submitTask('task-nats-offer');
        assert.equal((await installation.result('task-nats-offer')).state, 'pending', 'nothing runs during the partition');
        assert.equal(value(worker.running.root.journal.snapshot()).executions.length, 0, 'the worker launches nothing offline');
        await nats.heal();
        const executed = await assertExitedOnce(installation, 'task-nats-offer');
        const offers = await assertOneIntentPerAssignment(installation, worker);
        return `submitted ${submitAfterLostContact ? 'after' : 'before'} lost contact; ${offers} offers, ${executed.executions} execution`;
      } finally {
        await worker.stop();
      }
    }));
  });

  // Expected to fail: after a reconnect, an answer to a superseded inventory
  // request counts as unsolicited and asks again, in a loop (verification.md).
  test('the inventory exchange settles after a reconnect', { timeout: 90_000, todo: INVENTORY_LOOP }, async () => {
    const random = new SeededRandom(SEED);
    await recordScenario({ scenario: 'partition-worker-nats-inventory-settles', seed: SEED }, () => withInstallation({ postgres: 'direct', toxiproxy }, async (installation) => {
      const worker = await connectedWorker(installation, 'nats-inventory', random);
      try {
        await nats.disconnect();
        await waitFor(async () => !(await reachable(installation, worker.workerId)), 20_000, 'the control plane marks the worker lost');
        await installation.submitTask('task-nats-inventory');
        await nats.heal();
        await assertExitedOnce(installation, 'task-nats-inventory');
        await delayMilliseconds(SETTLE_MILLISECONDS);
        const settled = await inventoryRequests(installation);
        await delayMilliseconds(SETTLE_MILLISECONDS);
        const later = await inventoryRequests(installation);
        assert.ok(later - settled <= 1, `${later - settled} inventory requests in ${SETTLE_MILLISECONDS} ms after the task ended`);
        return `${later} inventory requests in all`;
      } finally {
        await worker.stop();
      }
    }));
  });

  // Seed: whether the heal comes before or after the process exits; an exit
  // journaled offline reaches the control plane from the local outbox.
  test('a partition while the process runs keeps its observations, published once after the heal', { timeout: 90_000 }, async () => {
    const random = new SeededRandom(SEED);
    const healAfterExit = random.nextInt(2) === 1;
    await recordScenario({ scenario: 'partition-worker-nats-while-running', seed: SEED }, () => withInstallation({ postgres: 'direct', toxiproxy }, async (installation) => {
      const worker = await connectedWorker(installation, 'nats-while-running', random);
      try {
        await installation.submitTask('task-nats-running');
        await waitFor(async () => (await startedExecutions(installation, 'task-nats-running')) === 1, 20_000, 'the start is recorded');
        await nats.disconnect();
        await waitFor(() => worker.logs.records.some(({ event }) => event === 'worker.contact.offline'), 20_000, 'the worker is offline');
        if (healAfterExit) {
          await waitFor(() => journaledState(worker) === 'exited', 20_000, 'the exit is journaled offline');
          assert.equal((await installation.result('task-nats-running')).state, 'pending', 'the exit waits in the local outbox');
        }
        await nats.heal();
        const executed = await assertExitedOnce(installation, 'task-nats-running');
        const duplicates = installation.logs.records.filter(({ event }) => event === 'execution.observation.duplicate').length;
        return `healed ${healAfterExit ? 'after' : 'before'} the exit; ${executed.executions} execution; ${duplicates} duplicate observations`;
      } finally {
        await worker.stop();
      }
    }));
  });
});

describe('control plane to PostgreSQL', () => {
  const postgres = toxiproxy.proxy('postgres');

  // Seed: how many unavailable answers the worker gets before the heal; it
  // repeats the same operation, which the healed authority then grants.
  test('a partition during authorization is unavailable, and the same operation is granted after the heal', { timeout: 90_000 }, async () => {
    const random = new SeededRandom(SEED);
    const failedAnswers = 1 + random.nextInt(3);
    await recordScenario({ scenario: 'partition-control-plane-postgres-authorization', seed: SEED }, () => withInstallation({ postgres: 'proxied', toxiproxy }, async (installation) => {
      const authority = new OrderedAuthority();
      authority.beforeRequest = new Gate();
      const worker = new ScenarioWorker(installation, {
        name: 'pg-authorization', random, nats: installation.nats, runMilliseconds: 500,
        enrollmentToken: await installation.enrollmentToken(), authority: authority.wrap,
      });
      await worker.start();
      try {
        await installation.submitTask('task-pg-authorization');
        await waitFor(() => authority.sent.length === 1, 20_000, 'the first authorization request');
        await postgres.disconnect();
        authority.beforeRequest.open();
        await waitFor(() => unavailableAnswers(authority) >= failedAnswers, 30_000, `${failedAnswers} unavailable answers`);
        assert.equal(installation.stopped === undefined ? 'running' : await settledOrRunning(installation.stopped), 'running',
          'the control plane keeps running without its database');
        await postgres.heal();
        await assertExitedOnce(installation, 'task-pg-authorization');
        const operations = new Set(authority.sent.map(({ operationId }) => operationId));
        assert.equal(operations.size, 1, 'every retry repeats the first operation');
        return `${unavailableAnswers(authority)} unavailable answers before the grant of the same operation`;
      } finally {
        await worker.stop();
      }
    }));
  });

  // Seed: whether the heal comes before or after the process exits; the
  // unapplied observations are redelivered and applied once.
  test('a partition while the process runs delays its observations, applied once after the heal', { timeout: 90_000 }, async () => {
    const random = new SeededRandom(SEED);
    const healAfterExit = random.nextInt(2) === 1;
    await recordScenario({ scenario: 'partition-control-plane-postgres-while-running', seed: SEED }, () => withInstallation({ postgres: 'proxied', toxiproxy }, async (installation) => {
      const worker = new ScenarioWorker(installation, {
        name: 'pg-running', random, nats: installation.nats, runMilliseconds: 2_500, enrollmentToken: await installation.enrollmentToken(),
      });
      await worker.start();
      try {
        await installation.submitTask('task-pg-running');
        await waitFor(() => journaledState(worker) === 'started', 20_000, 'the start is journaled');
        await postgres.disconnect();
        if (healAfterExit) await waitFor(() => journaledState(worker) === 'exited', 20_000, 'the exit is journaled');
        await delayMilliseconds(1_000);
        assert.equal(installation.stopped === undefined ? 'running' : await settledOrRunning(installation.stopped), 'running',
          'the control plane keeps running without its database');
        await postgres.heal();
        const executed = await assertExitedOnce(installation, 'task-pg-running');
        assert.deepEqual((await installation.call('GET', '/quarantine')).body, { records: [] }, 'nothing is quarantined');
        return `healed ${healAfterExit ? 'after' : 'before'} the exit; ${executed.executions} execution; ${executed.startKind} start`;
      } finally {
        await worker.stop();
      }
    }));
  });

  // Seed: the redrive order. Past the redelivery budget both observations
  // are quarantined; the reconnect's inventory or the redrive ends the task.
  test('a partition beyond the redelivery budget quarantines the observations, and the task ends once', { timeout: 90_000 }, async () => {
    const random = new SeededRandom(SEED);
    const exitFirst = random.nextInt(2) === 1;
    await recordScenario({ scenario: 'partition-control-plane-postgres-beyond-redelivery', seed: SEED }, () => withInstallation({ postgres: 'proxied', toxiproxy }, async (installation) => {
      const worker = new ScenarioWorker(installation, {
        name: 'pg-beyond', random, nats: installation.nats, runMilliseconds: 1_000, enrollmentToken: await installation.enrollmentToken(),
      });
      await worker.start();
      try {
        await installation.submitTask('task-pg-beyond');
        await waitFor(() => journaledState(worker) === 'started', 20_000, 'the start is journaled');
        await postgres.disconnect();
        await waitFor(() => journaledState(worker) === 'exited', 20_000, 'the exit is journaled');
        // The quarantine API needs the database, so the log tells the moment.
        const startAndExit = 2;
        await waitFor(() => lastDeliveries(installation) === startAndExit, REDELIVERY_BUDGET_MILLISECONDS + 20_000, 'the start and the exit quarantined');
        await postgres.heal();
        await waitFor(async () => (await quarantined(installation)).length === startAndExit, 20_000, 'the quarantine is listed');
        const records = await quarantined(installation);
        assert.deepEqual(records.map(({ reason, deliveries }) => [reason, deliveries]), records.map(() => ['max-deliveries', 5]));
        const beforeRedrive = (await installation.result('task-pg-beyond')).state;
        const ordered = exitFirst ? [...records].reverse() : records;
        for (const { sequence } of ordered) assert.equal((await installation.call('POST', `/quarantine/${sequence}/redrive`)).status, 200);
        const executed = await assertExitedOnce(installation, 'task-pg-beyond');
        assert.deepEqual(await quarantined(installation), [], 'the redrive empties the quarantine');
        return `${records.length} quarantined; task ${beforeRedrive} before the redrive, ${exitFirst ? 'exit' : 'start'} first; ${executed.startKind} start`;
      } finally {
        await worker.stop();
      }
    }));
  });
});

async function inventoryRequests(installation: ScenarioInstallation): Promise<number> {
  return (await installation.query(`SELECT 1 FROM outbox WHERE event_type = 'worker.inventory.requested'`)).length;
}

async function quarantined(installation: ScenarioInstallation): Promise<{ sequence: number; reason: string; deliveries: number }[]> {
  const listed = await installation.call('GET', '/quarantine');
  return listed.status === 200 ? listed.body.records as { sequence: number; reason: string; deliveries: number }[] : [];
}

// Observations whose last allowed delivery failed.
function lastDeliveries(installation: ScenarioInstallation): number {
  return installation.logs.records.filter(({ event, fields }) =>
    event === 'nats.message.redelivered' && fields.deliveryCount === SCENARIO_LIMITS.maxDeliver).length;
}

function unavailableAnswers(authority: OrderedAuthority): number {
  return authority.answered.filter(({ answer }) => !answer.ok && answer.error.code === 'unavailable').length;
}

async function settledOrRunning(stopped: Promise<'stopped' | 'failed'>): Promise<string> {
  return Promise.race([stopped, delayMilliseconds(0).then(() => 'running')]);
}

function delayMilliseconds(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
