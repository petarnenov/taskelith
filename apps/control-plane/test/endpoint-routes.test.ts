import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ROUTES, browserEndpointRoutes, workerEndpointRoutes } from '@taskelith/control-plane';

const idsOf = (routes: readonly { readonly operationId: string }[]) => routes.map((route) => route.operationId).sort();

// The operations whose only credentials are a worker's or an enrollment
// token, which a browser never holds (12d B1, coordinator answer Q11).
const WORKER_ONLY = [
  'authorizeLaunch', 'confirmWorkerCredentials', 'enrollWorker', 'fetchSlotCredential', 'publishEvidence', 'renewWorkerCredentials',
  'requestDelegation',
];
const BROWSER_ONLY = ['logIn', 'logOut', 'readSession'];

test('the browser endpoint serves every route but the worker-only and confidential ones', () => {
  const expected = ROUTES.filter((route) => !WORKER_ONLY.includes(route.operationId));
  assert.deepEqual(idsOf(browserEndpointRoutes(ROUTES)), idsOf(expected));
  for (const route of browserEndpointRoutes(ROUTES)) {
    assert.equal(route.confidential, undefined, route.operationId);
    assert.ok(route.security.some((scheme) => scheme !== 'workerCredential' && scheme !== 'enrollmentToken'), route.operationId);
  }
});

test('the worker endpoint serves every route but the browser-only ones', () => {
  const expected = ROUTES.filter((route) => !BROWSER_ONLY.includes(route.operationId));
  assert.deepEqual(idsOf(workerEndpointRoutes(ROUTES)), idsOf(expected));
});

test('the public reads and the webhook stay on both endpoints', () => {
  for (const operationId of ['readInstallationCa', 'receiveScmWebhook', 'readEvidence']) {
    assert.ok(idsOf(browserEndpointRoutes(ROUTES)).includes(operationId), operationId);
    assert.ok(idsOf(workerEndpointRoutes(ROUTES)).includes(operationId), operationId);
  }
});

test('a route is kept off the browser endpoint by its security alone, so a new worker route needs no flag', () => {
  const route = { ...ROUTES[0]!, operationId: 'futureWorkerOperation', security: ['workerCredential', 'enrollmentToken'] as const };
  assert.deepEqual(browserEndpointRoutes([route]), []);
  assert.deepEqual(idsOf(workerEndpointRoutes([route])), ['futureWorkerOperation']);
});
