import {
  parseCardRecord,
  type CardCatalog,
  type CardRecord,
  type CardTask,
  type WorkType,
} from '@taskelith/execution';
import { err, failure, ok, type Result } from '@taskelith/kernel';
import type { ProjectId, TaskId, WorkflowRunId } from '@taskelith/sdlc';
import { instant } from './capacity-repositories.js';
import type { Session } from './session.js';

interface CardRow {
  readonly run_id: string;
  readonly project_id: string;
  readonly title: string;
  readonly work_type: string;
  readonly created_at: Date;
}

interface LineageRow {
  readonly task_id: string;
  readonly run_id: string;
  readonly parent_task_id: string | null;
  readonly depth: number;
}

const CARD_COLUMNS = 'run_id, project_id, title, work_type, created_at';

// A card's run and every task of its lineage: the root's run is the card's.
const CARD_LINEAGE = `task_lineage AS lineage
  JOIN task_lineage AS root ON root.task_id = lineage.root_task_id
  JOIN cards ON cards.run_id = root.run_id`;

// The cards that task intake writes, and their lineage.
export class PostgresCardCatalog implements CardCatalog {
  readonly #session: Session;

  constructor(session: Session) {
    this.#session = session;
  }

  async register(card: CardRecord): Promise<Result<void>> {
    const parsed = parseCardRecord(card);
    if (!parsed.ok) return parsed;
    const { rowCount } = await this.#session.query(
      `INSERT INTO cards (${CARD_COLUMNS}) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (run_id) DO NOTHING`,
      [card.runId, card.projectId, card.title, card.workType, card.createdAt],
    );
    return rowCount === 1 ? ok(undefined) : err(failure('conflict', `run ${card.runId} is already a card`));
  }

  async get(runId: WorkflowRunId): Promise<Result<CardRecord | undefined>> {
    const { rows } = await this.#session.query<CardRow>(`SELECT ${CARD_COLUMNS} FROM cards WHERE run_id = $1`, [runId]);
    return ok(rows[0] === undefined ? undefined : cardOf(rows[0]));
  }

  async listByProject(projectId: ProjectId): Promise<Result<readonly CardRecord[]>> {
    const { rows } = await this.#session.query<CardRow>(
      `SELECT ${CARD_COLUMNS} FROM cards WHERE project_id = $1 ORDER BY created_at, run_id COLLATE "C"`, [projectId],
    );
    return ok(Object.freeze(rows.map(cardOf)));
  }

  // No store keeps the admission order, so task identifier order stands in.
  async tasks(runId: WorkflowRunId): Promise<Result<readonly CardTask[]>> {
    const { rows } = await this.#session.query<LineageRow>(
      `SELECT lineage.task_id, lineage.run_id, lineage.parent_task_id, lineage.depth FROM ${CARD_LINEAGE}
       WHERE cards.run_id = $1 ORDER BY lineage.task_id COLLATE "C"`,
      [runId],
    );
    return ok(Object.freeze(rows.map(cardTaskOf)));
  }
}

interface TouchRow {
  readonly subject: 'run' | 'task' | 'session' | 'project' | 'worker';
  readonly subject_id: string;
}

export interface TouchedCards {
  readonly touches: number;
  readonly runIds: readonly WorkflowRunId[];
  readonly workersChanged: boolean;
}

// The card projector's touches and the last events it appended.
export class PostgresCardProjections {
  readonly #session: Session;
  projected = false;

  constructor(session: Session) {
    this.#session = session;
  }

  // Removes the oldest touches and answers the cards they name; a worker's
  // touch names every card, since the fleet shapes each.
  async take(limit: number): Promise<Result<TouchedCards>> {
    const { rows } = await this.#session.query<TouchRow>(
      `DELETE FROM card_touches WHERE touch_id IN (SELECT touch_id FROM card_touches ORDER BY touch_id LIMIT $1)
       RETURNING subject, subject_id`, [limit],
    );
    if (rows.length > 0) this.projected = true;
    const of = (subject: TouchRow['subject']) => rows.filter((row) => row.subject === subject).map((row) => row.subject_id);
    const workersChanged = of('worker').length > 0;
    const { rows: cards } = await this.#session.query<{ run_id: string }>(
      `SELECT cards.run_id FROM cards WHERE cards.run_id = ANY($1) OR cards.project_id = ANY($2) OR $3
       UNION SELECT cards.run_id FROM ${CARD_LINEAGE} WHERE lineage.run_id = ANY($1) OR lineage.task_id = ANY($4)
         OR lineage.task_id IN (SELECT task_id FROM agent_sessions WHERE session_id = ANY($5))
       ORDER BY 1`,
      [of('run'), of('project'), workersChanged, of('task'), of('session')],
    );
    return ok(Object.freeze({ touches: rows.length, runIds: Object.freeze(cards.map((row) => row.run_id as WorkflowRunId)), workersChanged }));
  }

  async lastCard(runId: WorkflowRunId): Promise<Result<string | undefined>> {
    const { rows } = await this.#session.query<{ projection: string | null }>('SELECT projection FROM cards WHERE run_id = $1', [runId]);
    return ok(rows[0]?.projection ?? undefined);
  }

  async recordCard(runId: WorkflowRunId, projection: string): Promise<Result<void>> {
    await this.#session.query('UPDATE cards SET projection = $2 WHERE run_id = $1', [runId, projection]);
    return ok(undefined);
  }

  async lastWorkersOnline(projectId: ProjectId): Promise<Result<number | undefined>> {
    const { rows } = await this.#session.query<{ workers_online: number }>(
      'SELECT workers_online FROM board_projections WHERE project_id = $1', [projectId],
    );
    return ok(rows[0]?.workers_online);
  }

  async recordWorkersOnline(projectId: ProjectId, workersOnline: number): Promise<Result<void>> {
    await this.#session.query(
      `INSERT INTO board_projections (project_id, workers_online) VALUES ($1, $2)
       ON CONFLICT (project_id) DO UPDATE SET workers_online = EXCLUDED.workers_online`,
      [projectId, workersOnline],
    );
    return ok(undefined);
  }

  async projectIds(): Promise<Result<readonly ProjectId[]>> {
    const { rows } = await this.#session.query<{ project_id: string }>('SELECT project_id FROM projects ORDER BY project_id COLLATE "C"');
    return ok(Object.freeze(rows.map((row) => row.project_id as ProjectId)));
  }
}

function cardOf(row: CardRow): CardRecord {
  return Object.freeze({
    runId: row.run_id as WorkflowRunId, projectId: row.project_id as ProjectId, title: row.title,
    workType: row.work_type as WorkType, createdAt: instant(row.created_at),
  });
}

function cardTaskOf(row: LineageRow): CardTask {
  return Object.freeze({
    taskId: row.task_id as TaskId, taskRunId: row.run_id as WorkflowRunId,
    ...(row.parent_task_id === null ? {} : { parentTaskId: row.parent_task_id as TaskId }), depth: row.depth,
  });
}
