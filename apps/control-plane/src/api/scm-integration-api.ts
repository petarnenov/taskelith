import type { HttpSchemas } from '@taskelith/contracts';
import type { ScmIntegration, ScmIntegrationService } from '@taskelith/integrations';
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

  async createScmIntegration({ body }: ApiRequest): Promise<Result<Wire<'ScmIntegration'>>> {
    const created = await this.#integrations.create(body as Wire<'ScmIntegrationCreation'>);
    return created.ok ? ok(integrationBody(created.value)) : created;
  }

  async readScmIntegration({ parameters }: ApiRequest): Promise<Result<Wire<'ScmIntegration'>>> {
    const read = await this.#integrations.read(parameters[0] ?? '');
    return read.ok ? ok(integrationBody(read.value)) : read;
  }

  async updateScmIntegration({ parameters, body }: ApiRequest): Promise<Result<Wire<'ScmIntegration'>>> {
    const updated = await this.#integrations.update(parameters[0] ?? '', body as Wire<'ScmIntegrationUpdate'>);
    return updated.ok ? ok(integrationBody(updated.value)) : updated;
  }
}

function integrationBody(integration: ScmIntegration): Wire<'ScmIntegration'> {
  const { integrationId, pluginId, label, allowedOrigin, settings, secretNames, revision } = integration;
  return { integrationId, pluginId, label, allowedOrigin, settings: { ...settings }, secretNames: [...secretNames], revision };
}
