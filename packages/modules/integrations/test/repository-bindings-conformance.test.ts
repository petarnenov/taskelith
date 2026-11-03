import assert from 'node:assert/strict';
import test from 'node:test';
import { InMemoryRepositoryBindings, InMemoryScmIntegrations, REPOSITORY_BINDINGS_CONFORMANCE } from '@taskelith/integrations';

const PROJECT_IDS = [`p${'1'.repeat(32)}`, `p${'2'.repeat(32)}`] as const;

// Records whether exclusive work was queued while earlier work still ran,
// which an update's `exclusive` call does synchronously.
class WaitRecordingIntegrations extends InMemoryScmIntegrations {
  #running = 0;
  #queuedBehindRunning = false;

  get queuedBehindRunning(): boolean {
    return this.#queuedBehindRunning;
  }

  override exclusive<Value>(work: () => Promise<Value>): Promise<Value> {
    if (this.#running > 0) this.#queuedBehindRunning = true;
    return super.exclusive(async () => {
      this.#running += 1;
      try {
        return await work();
      } finally {
        this.#running -= 1;
      }
    });
  }
}

for (const conformance of REPOSITORY_BINDINGS_CONFORMANCE) {
  test(`in-memory repository bindings: ${conformance.name}`, async () => {
    const integrations = new WaitRecordingIntegrations();
    const bindings = new InMemoryRepositoryBindings(integrations);
    const pausingAfterIntegrationRead = (pause: () => Promise<void>) => new InMemoryRepositoryBindings({
      exclusive: (work) => integrations.exclusive(work),
      get: async (id) => {
        const read = await integrations.get(id);
        await pause();
        return read;
      },
    });
    const untilUpdateWaits = async () => integrations.queuedBehindRunning;
    const target = { bindings, integrations, projectIds: PROJECT_IDS, pausingAfterIntegrationRead, untilUpdateWaits };
    assert.deepEqual(await conformance.check(target), []);
  });
}
