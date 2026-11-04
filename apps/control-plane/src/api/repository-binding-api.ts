import type { HttpSchemas } from '@taskelith/contracts';
import type { RepositoryBinding, RepositoryBindingService } from '@taskelith/integrations';
import { ok, type Result } from '@taskelith/kernel';
import type { ApiRequest } from './api-server.js';

type Wire<Name extends keyof HttpSchemas> = HttpSchemas[Name];

export type RepositoryBindingOperations = Pick<RepositoryBindingService, 'read' | 'bind'>;

// The handlers of wire contracts section 4 for the repository binding. The
// server checked the role on the path's project before the body.
export class RepositoryBindingApi {
  readonly #bindings: RepositoryBindingOperations;

  constructor(bindings: RepositoryBindingOperations) {
    this.#bindings = bindings;
  }

  async readRepositoryBinding({ parameters }: ApiRequest): Promise<Result<Wire<'RepositoryBinding'>>> {
    const read = await this.#bindings.read(parameters[0] ?? '');
    return read.ok ? ok(bindingBody(read.value)) : read;
  }

  async bindRepository({ parameters, body }: ApiRequest): Promise<Result<Wire<'RepositoryBinding'>>> {
    const bound = await this.#bindings.bind(parameters[0] ?? '', body as Wire<'RepositoryBindingUpdate'>);
    return bound.ok ? ok(bindingBody(bound.value)) : bound;
  }
}

function bindingBody(binding: RepositoryBinding): Wire<'RepositoryBinding'> {
  const { integrationId, repository, remoteUrl, integrationBranch, mergeMethod, revision } = binding;
  return { integrationId, repository, remoteUrl, integrationBranch, mergeMethod, revision };
}
