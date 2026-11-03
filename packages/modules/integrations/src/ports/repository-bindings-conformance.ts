import { parseIdentifier, type Result } from '@taskelith/kernel';
import { expectCode, expectOneWinner, expectRead, expectSame, type ConformanceCase } from '@taskelith/sdlc';
import { normalizeOrigin } from '../domain/normalized-origin.js';
import type { RepositoryBinding, RepositoryBindingValues } from '../domain/repository-binding.js';
import { ScmSecrets, type ScmIntegration, type ScmIntegrationId } from '../domain/scm-integration.js';
import type { BindingPut, RepositoryBindings } from './repository-bindings.js';
import type { ScmIntegrations } from './scm-integrations.js';

// A store under test with the integrations it checks against and two
// existing, unbound projects; each case starts on empty stores.
export interface RepositoryBindingsTarget {
  readonly bindings: RepositoryBindings;
  readonly integrations: Pick<ScmIntegrations, 'add' | 'update'>;
  readonly projectIds: readonly [string, string];
}

function must<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`conformance fixture: ${result.error.message}`);
  return result.value;
}

const integrationId = (digit: string) => must(parseIdentifier('ScmIntegrationId', `i${digit.repeat(32)}`)) as ScmIntegrationId;

async function added(target: RepositoryBindingsTarget, digit: string): Promise<ScmIntegration> {
  const integration = {
    integrationId: integrationId(digit), pluginId: 'scm-example', label: 'Example', allowedOrigin: must(normalizeOrigin('https://git.example.com')),
    settings: {}, secretNames: ['webhook-secret'], revision: 1,
  };
  return must(await target.integrations.add(integration, must(ScmSecrets.of({ 'webhook-secret': 'synthetic-webhook-secret' }))));
}

function values(integration: ScmIntegration, repository = 'acme/project'): RepositoryBindingValues {
  return {
    integrationId: integration.integrationId, repository, remoteUrl: `https://git.example.com/${repository}.git`,
    integrationBranch: 'main', mergeMethod: 'squash',
  };
}

function firstPut(projectId: string, integration: ScmIntegration, repository?: string): BindingPut {
  return { projectId, values: values(integration, repository), integrationRevision: integration.revision };
}

function bound(projectId: string, put: BindingPut, revision: number): RepositoryBinding {
  return { projectId, ...put.values, revision };
}

export const REPOSITORY_BINDINGS_CONFORMANCE: readonly ConformanceCase<RepositoryBindingsTarget>[] = Object.freeze([
  {
    name: 'an unbound project reads as none, and a first put stores revision 1 that reads back',
    async check(target) {
      const problems: string[] = [];
      const [projectId] = target.projectIds;
      expectRead(problems, 'unbound', await target.bindings.get(projectId), undefined);
      const put = firstPut(projectId, await added(target, '1'));
      expectRead(problems, 'first put', await target.bindings.put(put), bound(projectId, put, 1));
      expectRead(problems, 'read', await target.bindings.get(projectId), bound(projectId, put, 1));
      return problems;
    },
  },
  {
    name: 'a first put on a bound project and a put with a revision on an unbound one fail with conflict',
    async check(target) {
      const problems: string[] = [];
      const [projectId, other] = target.projectIds;
      const integration = await added(target, '1');
      const put = firstPut(projectId, integration);
      must(await target.bindings.put(put));
      expectCode(problems, 'first put again', await target.bindings.put(put), 'conflict');
      expectCode(problems, 'revision on unbound', await target.bindings.put({ ...firstPut(other, integration), expectedRevision: 1 }), 'conflict');
      expectRead(problems, 'unchanged', await target.bindings.get(projectId), bound(projectId, put, 1));
      expectRead(problems, 'still unbound', await target.bindings.get(other), undefined);
      return problems;
    },
  },
  {
    name: 'a put at the current revision changes any field and moves the revision by one, and a stale one fails with conflict',
    async check(target) {
      const problems: string[] = [];
      const [projectId] = target.projectIds;
      const put = firstPut(projectId, await added(target, '1'));
      must(await target.bindings.put(put));
      const second = await added(target, '2');
      const changed: BindingPut = {
        projectId, expectedRevision: 1, integrationRevision: 1,
        values: { ...values(second, 'acme/renamed'), integrationBranch: 'dev', mergeMethod: 'rebase' },
      };
      expectRead(problems, 'rebind', await target.bindings.put(changed), bound(projectId, changed, 2));
      expectCode(problems, 'stale', await target.bindings.put({ ...changed, expectedRevision: 1 }), 'conflict');
      expectRead(problems, 'read', await target.bindings.get(projectId), bound(projectId, changed, 2));
      return problems;
    },
  },
  {
    name: 'a put of the stored values at the current revision returns the binding at that revision',
    async check(target) {
      const problems: string[] = [];
      const [projectId] = target.projectIds;
      const put = firstPut(projectId, await added(target, '1'));
      must(await target.bindings.put(put));
      expectRead(problems, 'same again', await target.bindings.put({ ...put, expectedRevision: 1 }), bound(projectId, put, 1));
      expectRead(problems, 'read', await target.bindings.get(projectId), bound(projectId, put, 1));
      return problems;
    },
  },
  {
    name: 'a put against a moved integration revision or a missing integration fails with conflict and changes nothing',
    async check(target) {
      const problems: string[] = [];
      const [projectId, other] = target.projectIds;
      const integration = await added(target, '1');
      const put = firstPut(projectId, integration);
      must(await target.bindings.put(put));
      must(await target.integrations.update(integration.integrationId, { expectedRevision: 1, label: 'Moved' }));
      expectCode(problems, 'moved', await target.bindings.put({ ...put, expectedRevision: 1, values: { ...put.values, integrationBranch: 'dev' } }), 'conflict');
      expectRead(problems, 'unchanged', await target.bindings.get(projectId), bound(projectId, put, 1));
      const missing = { ...firstPut(other, integration), values: { ...values(integration), integrationId: integrationId('9') } };
      expectCode(problems, 'missing', await target.bindings.put(missing), 'conflict');
      expectRead(problems, 'still unbound', await target.bindings.get(other), undefined);
      return problems;
    },
  },
  {
    name: 'of two concurrent first puts exactly one wins, and the bindings of two projects are apart',
    async check(target) {
      const problems: string[] = [];
      const [projectId, other] = target.projectIds;
      const integration = await added(target, '1');
      const candidates = ['acme/first', 'acme/second'].map((repository) => firstPut(projectId, integration, repository));
      const winner = expectOneWinner(problems, 'concurrent', await Promise.all(candidates.map((put) => target.bindings.put(put))));
      if (winner !== undefined) expectRead(problems, 'winner stored', await target.bindings.get(projectId), bound(projectId, candidates[winner]!, 1));
      const apart = firstPut(other, integration, 'acme/apart');
      must(await target.bindings.put(apart));
      const read = await target.bindings.get(other);
      expectSame(problems, 'other project', read.ok ? read.value : undefined, bound(other, apart, 1));
      return problems;
    },
  },
]);
