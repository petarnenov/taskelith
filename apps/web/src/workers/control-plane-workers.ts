import { createApiClient, hasStatus, type ApiRequest } from '../api/client';
import { failureOf, reachable, type ReadResult } from '../api/read-result';
import type { WorkersGateway, WorkersView } from './workers';
import { workersViewOf } from './workers-wire';

// listWorkers through the typed fetch. The read is a GET, so the client
// is given no CSRF token to send.

interface WorkersGatewayOptions {
  readonly fetch?: typeof fetch;
}

export function createWorkersGateway({ fetch: send }: WorkersGatewayOptions = {}): WorkersGateway {
  const request: ApiRequest = createApiClient({ csrfToken: () => undefined, fetch: send });

  // listWorkers documents no 404, so one is an undocumented status.
  async function listWorkers(): Promise<ReadResult<WorkersView>> {
    const result = await reachable(() => request('get', '/workers'));
    if (result === undefined) return { kind: 'unavailable' };
    if (!hasStatus(result, 200)) {
      const failure = failureOf(result);
      return failure.kind === 'not-found' ? { kind: 'unavailable' } : failure;
    }
    const view = workersViewOf(result.body);
    return view === undefined ? { kind: 'unavailable' } : { kind: 'read', value: view };
  }

  return { listWorkers };
}
