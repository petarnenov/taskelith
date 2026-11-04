import { err, failure, ok, type Result } from '@taskelith/kernel';
import {
  integrationMoved,
  nextBinding,
  type BindingPut,
  type MergeMethod,
  type RepositoryBinding,
  type RepositoryBindings,
  type ScmIntegrationId,
} from '@taskelith/integrations';
import type { PostgresDatabase } from './postgres-database.js';
import type { Session } from './session.js';

interface BindingRow {
  readonly project_id: string;
  readonly integration_id: string;
  readonly repository: string;
  readonly remote_url: string;
  readonly integration_branch: string;
  readonly merge_method: MergeMethod;
  readonly revision: number;
}

const COLUMNS = 'project_id, integration_id, repository, remote_url, integration_branch, merge_method, revision';

// The rows inside one transaction.
export class PostgresRepositoryBindingRecords {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async get(projectId: string): Promise<RepositoryBinding | undefined> {
    const { rows } = await this.#session.query<BindingRow>(`SELECT ${COLUMNS} FROM project_repository_bindings WHERE project_id = $1`, [projectId]);
    return rows[0] === undefined ? undefined : bindingOf(rows[0]);
  }

  // Locks the integration's row against a concurrent change until commit.
  async integrationRevision(integrationId: ScmIntegrationId): Promise<number | undefined> {
    const { rows } = await this.#session.query<{ revision: number }>(
      'SELECT revision FROM scm_integrations WHERE integration_id = $1 FOR SHARE', [integrationId]);
    return rows[0]?.revision;
  }

  // False when another transaction bound the project first.
  async insert(binding: RepositoryBinding): Promise<boolean> {
    const { rowCount } = await this.#session.query(`INSERT INTO project_repository_bindings (${COLUMNS})
      VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (project_id) DO NOTHING`, valuesOf(binding));
    return rowCount === 1;
  }

  // Only at `expectedRevision`; false when the revision moved.
  async replace(binding: RepositoryBinding, expectedRevision: number): Promise<boolean> {
    const { rowCount } = await this.#session.query(`UPDATE project_repository_bindings SET integration_id = $2, repository = $3,
      remote_url = $4, integration_branch = $5, merge_method = $6, revision = $7 WHERE project_id = $1 AND revision = $8`,
    [...valuesOf(binding), expectedRevision]);
    return rowCount === 1;
  }
}

// Reads in read-only transactions; a put checks the integration's revision
// and writes the binding in one SERIALIZABLE transaction.
export class PostgresRepositoryBindings implements RepositoryBindings {
  readonly #database: Pick<PostgresDatabase, 'transaction' | 'readOnly'>;

  constructor(database: Pick<PostgresDatabase, 'transaction' | 'readOnly'>) {
    this.#database = database;
  }

  get(projectId: string): Promise<Result<RepositoryBinding | undefined>> {
    return this.#database.readOnly(async ({ repositoryBindings: records }) => ok(await records.get(projectId)));
  }

  put(put: BindingPut): Promise<Result<RepositoryBinding>> {
    return this.#database.transaction(async ({ repositoryBindings: records }) => {
      const revision = await records.integrationRevision(put.values.integrationId);
      if (revision !== put.integrationRevision) return err(integrationMoved());
      const current = await records.get(put.projectId);
      const next = nextBinding(current, put);
      if (!next.ok || next.value === current) return next;
      const written = current === undefined ? await records.insert(next.value) : await records.replace(next.value, current.revision);
      return written ? next : err(failure('conflict', 'the binding changed while it was written'));
    });
  }
}

function valuesOf(binding: RepositoryBinding): unknown[] {
  const { projectId, integrationId, repository, remoteUrl, integrationBranch, mergeMethod, revision } = binding;
  return [projectId, integrationId, repository, remoteUrl, integrationBranch, mergeMethod, revision];
}

function bindingOf(row: BindingRow): RepositoryBinding {
  return Object.freeze({
    projectId: row.project_id, integrationId: row.integration_id as ScmIntegrationId, repository: row.repository, remoteUrl: row.remote_url,
    integrationBranch: row.integration_branch, mergeMethod: row.merge_method, revision: row.revision,
  });
}
