import type { HttpSchemas } from '@taskelith/contracts';
import type { ScmIntegration, ScmIntegrationInvocation, ScmIntegrationService } from '@taskelith/integrations';
import { err, failure, ok, parseIdentifier, type Result } from '@taskelith/kernel';
import type { ApiRequest } from './api-server.js';

type Wire<Name extends keyof HttpSchemas> = HttpSchemas[Name];

export type ScmIntegrationOperations = Pick<ScmIntegrationService, 'list' | 'read' | 'create' | 'update'>;

// The handlers of wire contracts section 4 for SCM integrations. The server
// checked the role before the body; no answer carries a secret's value.
export class ScmIntegrationApi {
  readonly #integrations: ScmIntegrationOperations;

  constructor(integrations: ScmIntegrationOperations) {
    this.#integrations = integrations;
  }

  async listScmIntegrations({ query }: ApiRequest): Promise<Result<Wire<'ScmIntegrationPage'>>> {
    const after = query.get('after');
    if (after !== null && !parseIdentifier('Identifier', after).ok) return err(failure('invalid', 'after must be an identifier', { field: 'after' }));
    const page = await this.#integrations.list(after ?? undefined);
    if (!page.ok) return page;
    return ok({ integrations: page.value.items.map(integrationBody), ...(page.value.next === undefined ? {} : { next: page.value.next }) });
  }

  async createScmIntegration(request: ApiRequest): Promise<Result<Wire<'ScmIntegration'>>> {
    const invocation = invocationOf(request, 'createScmIntegration');
    if (!invocation.ok) return invocation;
    const created = await this.#integrations.create(request.body as Wire<'ScmIntegrationCreation'>, invocation.value);
    return created.ok ? ok(integrationBody(created.value)) : created;
  }

  async readScmIntegration({ parameters }: ApiRequest): Promise<Result<Wire<'ScmIntegration'>>> {
    const read = await this.#integrations.read(parameters[0] ?? '');
    return read.ok ? ok(integrationBody(read.value)) : read;
  }

  async updateScmIntegration(request: ApiRequest): Promise<Result<Wire<'ScmIntegration'>>> {
    const invocation = invocationOf(request, 'updateScmIntegration');
    if (!invocation.ok) return invocation;
    const update = request.body as Wire<'ScmIntegrationUpdate'>;
    const updated = await this.#integrations.update(request.parameters[0] ?? '', update, invocation.value);
    return updated.ok ? ok(integrationBody(updated.value)) : updated;
  }
}

// The caller is the audited actor; the operation is the reason.
function invocationOf({ principalId }: ApiRequest, operationId: string): Result<ScmIntegrationInvocation> {
  if (principalId === undefined) return err(failure('internal', 'an SCM integration command reached its handler without a principal'));
  return ok({ actor: principalId, reason: `control-plane API ${operationId}` });
}

function integrationBody(integration: ScmIntegration): Wire<'ScmIntegration'> {
  const { integrationId, pluginId, label, allowedOrigin, settings, secretNames, revision } = integration;
  return { integrationId, pluginId, label, allowedOrigin, settings: { ...settings }, secretNames: [...secretNames], revision };
}
