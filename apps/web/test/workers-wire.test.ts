import { describe, expect, it } from 'vitest';
import type { SelfCheckResult } from '../src/workers/workers';
import { workersViewOf } from '../src/workers/workers-wire';
import { worker, workersView } from './fakes';

const FAILED: SelfCheckResult = { checkId: 'launch-command', outcome: 'failed', details: ['the launch command exited with 1'] };
const NOT_APPLICABLE: SelfCheckResult = { checkId: 'sandbox', outcome: 'not-applicable', details: ['platform-not-covered'] };

describe('workersViewOf', () => {
  it('reads the view with every variant of a self-check result and keeps the wire order', () => {
    const view = workersView({
      workers: [
        worker({ workerId: 'worker-2', admission: 'self-check-failed', results: [FAILED, NOT_APPLICABLE] }),
        worker({ workerId: 'worker-1', admission: 'awaiting-self-check', reportedAt: undefined, results: [] }),
      ],
    });
    expect(workersViewOf(JSON.parse(JSON.stringify(view)))).toEqual(view);
  });

  it('keeps only the fields the screen shows, so an unknown field never reaches it', () => {
    const planted = { ...worker(), credentialHash: 'planted', host: { ...worker().host, address: '10.0.0.1' } };
    const view = workersViewOf({ asOf: '2026-11-03T09:10:00.000Z', workers: [planted], secret: 'planted' });
    expect(view).toEqual(workersView());
    expect(JSON.stringify(view)).not.toContain('planted');
    expect(JSON.stringify(view)).not.toContain('10.0.0.1');
  });

  it('reads an entry without a report as one without reportedAt', () => {
    const view = workersViewOf(workersView({ workers: [worker({ reportedAt: undefined })] }));
    expect(view?.workers[0]).not.toHaveProperty('reportedAt');
  });

  it.each<[string, unknown]>([
    ['no body', undefined],
    ['an unreadable asOf', { ...workersView(), asOf: 'yesterday' }],
    ['no workers array', { ...workersView(), workers: undefined }],
    ['a worker without an identifier', workersView({ workers: [{ ...worker(), workerId: '' }] })],
    ['a worker without a host', { ...workersView(), workers: [{ ...worker(), host: undefined }] }],
    ['an unknown platform', workersView({ workers: [worker({ host: { platform: 'windows' as never, architecture: 'x64', hostname: 'h' } })] })],
    ['an unknown architecture', workersView({ workers: [worker({ host: { platform: 'linux', architecture: 'arm' as never, hostname: 'h' } })] })],
    ['an empty hostname', workersView({ workers: [worker({ host: { platform: 'linux', architecture: 'x64', hostname: '' } })] })],
    ['an unreadable enrolledAt', workersView({ workers: [worker({ enrolledAt: 'yesterday' })] })],
    ['an unreadable reportedAt', workersView({ workers: [worker({ reportedAt: 'yesterday' })] })],
    ['an unknown admission state', workersView({ workers: [worker({ admission: 'revoked' as never })] })],
    ['no results array', { ...workersView(), workers: [{ ...worker(), results: undefined }] }],
    ['nine results', workersView({ workers: [worker({ results: Array.from({ length: 9 }, (_, i) => ({ checkId: `c${i}`, outcome: 'passed', details: [] })) })] })],
    ['a check identifier of the wrong shape', workersView({ workers: [worker({ results: [{ checkId: 'Launch', outcome: 'passed', details: [] }] })] })],
    ['an unknown outcome', workersView({ workers: [worker({ results: [{ checkId: 'c', outcome: 'skipped', details: [] } as never] })] })],
    ['a passed check with details', workersView({ workers: [worker({ results: [{ checkId: 'c', outcome: 'passed', details: ['x'] }] })] })],
    ['a failed check without a problem', workersView({ workers: [worker({ results: [{ checkId: 'c', outcome: 'failed', details: [] }] })] })],
    ['a failed check with nine problems', workersView({ workers: [worker({ results: [{ checkId: 'c', outcome: 'failed', details: Array(9).fill('p') }] })] })],
    ['a failed check with an empty problem', workersView({ workers: [worker({ results: [{ checkId: 'c', outcome: 'failed', details: [''] }] })] })],
    ['a not-applicable check with two reasons', workersView({ workers: [worker({ results: [{ ...NOT_APPLICABLE, details: ['platform-not-covered', 'no-launch-command'] }] })] })],
    ['a not-applicable check with an unknown reason', workersView({ workers: [worker({ results: [{ ...NOT_APPLICABLE, details: ['no-disk'] } as never] })] })],
    ['a result without details', workersView({ workers: [worker({ results: [{ checkId: 'c', outcome: 'passed' } as never] })] })],
  ])('reads %s as no view', (_, body) => {
    expect(workersViewOf(body)).toBeUndefined();
  });
});
