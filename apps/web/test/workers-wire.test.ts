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

  // The OpenAPI scalars: Identifier (1 to 128 printable ASCII characters),
  // DisplayText (1 to 1,024 characters, no control character), UTC Instant.
  describe('the scalar bounds', () => {
    const withProblem = (problem: string) => workersView({ workers: [worker({ results: [{ ...FAILED, details: [problem] }] })] });
    const withHostname = (hostname: string) => workersView({ workers: [worker({ host: { platform: 'linux', architecture: 'x64', hostname } })] });

    it.each<[string, unknown]>([
      ['an identifier of 128 printable characters', workersView({ workers: [worker({ workerId: '!'.repeat(64) + '~'.repeat(64) })] })],
      ['a hostname of 1,024 characters', withHostname('h'.repeat(1024))],
      ['a hostname with a non-ASCII letter', withHostname('bürø-1.example')],
      ['a problem of 1,024 astral characters', withProblem('\u{1F600}'.repeat(1024))],
      ['an instant at the end of a day', workersView({ asOf: '2026-12-31T23:59:59.999Z' })],
    ])('reads %s', (_, body) => {
      expect(workersViewOf(JSON.parse(JSON.stringify(body)))).toEqual(body);
    });

    it.each<[string, unknown]>([
      ['an identifier of 129 characters', workersView({ workers: [worker({ workerId: 'w'.repeat(129) })] })],
      ['an identifier with a space', workersView({ workers: [worker({ workerId: 'worker 1' })] })],
      ['an identifier with a non-ASCII letter', workersView({ workers: [worker({ workerId: 'wörker-1' })] })],
      ['an identifier with a control character', workersView({ workers: [worker({ workerId: 'worker-1\u0007' })] })],
      ['a hostname of 1,025 characters', withHostname('h'.repeat(1025))],
      ['a hostname with a control character', withHostname('build-1\u0000.example')],
      ['a hostname with a delete character', withHostname('build-1\u007f.example')],
      ['a hostname with a C1 control character', withHostname('build-1\u0085.example')],
      ['a hostname with a line break', withHostname('build-1\n.example')],
      ['a problem of 1,025 characters', withProblem('p'.repeat(1025))],
      ['a problem of 1,025 astral characters', withProblem('\u{1F600}'.repeat(1025))],
      ['a problem with a control character', withProblem('launch\u001b[31m refused')],
      ['a date-only asOf', workersView({ asOf: '2026-11-03' })],
      ['an asOf without milliseconds', workersView({ asOf: '2026-11-03T09:10:00Z' })],
      ['an asOf with an offset', workersView({ asOf: '2026-11-03T09:10:00.000+00:00' })],
      ['an asOf with microseconds', workersView({ asOf: '2026-11-03T09:10:00.000000Z' })],
      ['an asOf of the pattern that is no date', workersView({ asOf: '2026-13-45T09:10:00.000Z' })],
      ['a date-only enrolledAt', workersView({ workers: [worker({ enrolledAt: '2026-11-03' })] })],
      ['a reportedAt without the zone', workersView({ workers: [worker({ reportedAt: '2026-11-03T09:05:00.000' })] })],
    ])('reads %s as no view', (_, body) => {
      expect(workersViewOf(body)).toBeUndefined();
    });
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
