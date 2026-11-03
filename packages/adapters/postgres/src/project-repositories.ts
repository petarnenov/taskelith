import {
  AUTO_MERGE_STARTS_ON,
  FIRST_REVISION,
  revisionConflict,
  unknownProject,
  type NoEligibleSlotPolicy,
  type PrincipalId,
  type Project,
  type ProjectDefaults,
  type ProjectQuery,
  type Projects,
  type SettingChange,
  type SpecApprover,
  type StoredAutoMergeSetting,
  type StoredDefaults,
} from '@taskelith/access';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { ProjectId } from '@taskelith/sdlc';
import { instant } from './capacity-repositories.js';
import type { Session } from './session.js';

interface ProjectRow {
  readonly project_id: string;
  readonly name: string;
  readonly created_at: Date;
  readonly revision: number;
}

interface ChangeColumns {
  readonly revision: number;
  readonly changed_by: string | null;
  readonly changed_at: Date | null;
}

interface DefaultsRow extends ChangeColumns {
  readonly framework_plugin_id: string;
  readonly implementers: string[];
  readonly reviewer: string;
  readonly spec_approver: SpecApprover;
  readonly no_eligible_slot: NoEligibleSlotPolicy;
}

interface AutoMergeRow extends ChangeColumns {
  readonly enabled: boolean;
}

const PROJECT_COLUMNS = 'project_id, name, created_at, revision';
const DEFAULTS_COLUMNS = 'framework_plugin_id, implementers, reviewer, spec_approver, no_eligible_slot, revision, changed_by, changed_at';

function projectOf(row: ProjectRow): Project {
  return Object.freeze({ projectId: row.project_id as ProjectId, name: row.name, createdAt: instant(row.created_at), revision: row.revision });
}

function lastChangeOf(row: ChangeColumns): { lastChange?: SettingChange } {
  if (row.changed_by === null || row.changed_at === null) return {};
  return { lastChange: Object.freeze({ changedBy: row.changed_by as PrincipalId, changedAt: instant(row.changed_at) }) };
}

function defaultsOf(row: DefaultsRow): StoredDefaults {
  const defaults: ProjectDefaults = Object.freeze({
    frameworkPluginId: row.framework_plugin_id, implementers: Object.freeze([...row.implementers]), reviewer: row.reviewer,
    specApprover: row.spec_approver, noEligibleSlot: row.no_eligible_slot,
  });
  return Object.freeze({ defaults, revision: row.revision, ...lastChangeOf(row) });
}

function defaultsValues(defaults: ProjectDefaults): unknown[] {
  return [defaults.frameworkPluginId, [...defaults.implementers], defaults.reviewer, defaults.specApprover, defaults.noEligibleSlot];
}

// The Access module's projects, their defaults, and the initial auto-merge
// setting, over one transaction's session; identifiers compare as "C".
export class PostgresProjects implements Projects {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async add(project: Project, defaults: ProjectDefaults): Promise<Result<void>> {
    const { rowCount } = await this.#session.query(
      'INSERT INTO projects (project_id, name, created_at, revision) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
      [project.projectId, project.name, project.createdAt, project.revision],
    );
    if (rowCount === 0) return err(failure('conflict', `the project ${project.projectId} exists`));
    await this.#session.query(
      `INSERT INTO project_defaults (project_id, framework_plugin_id, implementers, reviewer, spec_approver, no_eligible_slot, revision)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [project.projectId, ...defaultsValues(defaults), FIRST_REVISION],
    );
    await this.#session.query(
      'INSERT INTO auto_merge_settings (project_id, enabled, revision) VALUES ($1, $2, $3)',
      [project.projectId, AUTO_MERGE_STARTS_ON, FIRST_REVISION],
    );
    return ok(undefined);
  }

  async get(projectId: string): Promise<Result<Project | undefined>> {
    const { rows } = await this.#session.query<ProjectRow>(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE project_id = $1`, [projectId]);
    return ok(rows[0] === undefined ? undefined : projectOf(rows[0]));
  }

  async page({ after, limit, memberOf }: ProjectQuery): Promise<Result<readonly Project[]>> {
    const { rows } = await this.#session.query<ProjectRow>(
      `SELECT ${PROJECT_COLUMNS} FROM projects p
       WHERE ($1::text IS NULL OR p.project_id COLLATE "C" > $1::text COLLATE "C")
         AND ($3::text IS NULL OR EXISTS (
           SELECT 1 FROM project_roles r WHERE r.project_id = p.project_id AND r.principal_id = $3::text))
       ORDER BY p.project_id COLLATE "C" LIMIT $2`,
      [after ?? null, limit, memberOf ?? null],
    );
    return ok(rows.map(projectOf));
  }

  async rename(projectId: string, expectedRevision: number, name: string): Promise<Result<Project>> {
    const { rows } = await this.#session.query<ProjectRow>(
      `UPDATE projects SET name = $3, revision = revision + 1 WHERE project_id = $1 AND revision = $2 RETURNING ${PROJECT_COLUMNS}`,
      [projectId, expectedRevision, name],
    );
    if (rows[0] !== undefined) return ok(projectOf(rows[0]));
    return this.#missed(projectId, 'project');
  }

  async defaults(projectId: string): Promise<Result<StoredDefaults | undefined>> {
    const { rows } = await this.#session.query<DefaultsRow>(`SELECT ${DEFAULTS_COLUMNS} FROM project_defaults WHERE project_id = $1`, [projectId]);
    return ok(rows[0] === undefined ? undefined : defaultsOf(rows[0]));
  }

  async replaceDefaults(
    projectId: string, expectedRevision: number, defaults: ProjectDefaults, change: SettingChange,
  ): Promise<Result<StoredDefaults>> {
    const { rows } = await this.#session.query<DefaultsRow>(
      `UPDATE project_defaults SET framework_plugin_id = $3, implementers = $4, reviewer = $5, spec_approver = $6,
         no_eligible_slot = $7, revision = revision + 1, changed_by = $8, changed_at = $9
       WHERE project_id = $1 AND revision = $2 RETURNING ${DEFAULTS_COLUMNS}`,
      [projectId, expectedRevision, ...defaultsValues(defaults), change.changedBy, change.changedAt],
    );
    if (rows[0] !== undefined) return ok(defaultsOf(rows[0]));
    return this.#missed(projectId, 'project defaults');
  }

  async autoMergeSetting(projectId: string): Promise<Result<StoredAutoMergeSetting | undefined>> {
    const { rows } = await this.#session.query<AutoMergeRow>(
      'SELECT enabled, revision, changed_by, changed_at FROM auto_merge_settings WHERE project_id = $1',
      [projectId],
    );
    const row = rows[0];
    return ok(row === undefined ? undefined : Object.freeze({ enabled: row.enabled, revision: row.revision, ...lastChangeOf(row) }));
  }

  // A compare-and-set that changed no row: unknown project or moved revision.
  async #missed(projectId: string, what: string): Promise<Result<never>> {
    const { rows } = await this.#session.query('SELECT 1 FROM projects WHERE project_id = $1', [projectId]);
    return rows.length === 0 ? unknownProject() : revisionConflict(what);
  }
}
