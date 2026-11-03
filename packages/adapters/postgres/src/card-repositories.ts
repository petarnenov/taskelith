import {
  parseCardRecord,
  type CardCatalog,
  type NeedsYouItem,
  type NeedsYouItemId,
  type CardRecord,
  type CardTask,
  type WorkType,
} from '@taskelith/execution';
import { err, failure, ok, type Instant, type Result } from '@taskelith/kernel';
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

// A card's tasks in admission order, each delegated child under its
// parent: the path of admission sequences from the root orders them.
const CARD_ROOT_TASKS = `SELECT lineage.task_id, lineage.run_id, lineage.parent_task_id, lineage.depth,
    ARRAY[tasks.admission_seq] AS admission_path
  FROM task_lineage AS lineage JOIN tasks ON tasks.id = lineage.task_id
  WHERE lineage.run_id = $1 AND lineage.depth = 0 AND EXISTS (SELECT 1 FROM cards WHERE cards.run_id = $1)`;
const DELEGATED_TASKS = `SELECT child.task_id, child.run_id, child.parent_task_id, child.depth,
    ordered.admission_path || tasks.admission_seq
  FROM ordered JOIN task_lineage AS child ON child.parent_task_id = ordered.task_id
  JOIN tasks ON tasks.id = child.task_id`;

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

  async tasks(runId: WorkflowRunId): Promise<Result<readonly CardTask[]>> {
    const { rows } = await this.#session.query<LineageRow>(
      `WITH RECURSIVE ordered AS (${CARD_ROOT_TASKS} UNION ALL ${DELEGATED_TASKS})
       SELECT task_id, run_id, parent_task_id, depth FROM ordered ORDER BY admission_path`,
      [runId],
    );
    return ok(Object.freeze(rows.map(cardTaskOf)));
  }
}

interface TouchRow {
  readonly subject: 'run' | 'task' | 'admission' | 'session';
  readonly subject_id: string;
}

// The touches of a project, a worker, or the fleet, which name many cards,
// and of an unrecorded process, which names none.
const BROAD_SUBJECTS = "subject IN ('project', 'worker', 'fleet', 'unrecorded-process')";
const EVERY_CARD_SUBJECTS: ReadonlySet<string> = new Set(['worker', 'fleet']);

export interface ExpandedTouches {
  readonly touches: number;
  readonly through: string;
  readonly workersChanged: boolean;
  readonly processesChanged: boolean;
}

export interface TouchedCards {
  readonly touches: number;
  readonly runIds: readonly WorkflowRunId[];
}

// The card projector's touches and the last events it appended.
export class PostgresCardProjections {
  readonly #session: Session;
  projected = false;

  constructor(session: Session) {
    this.#session = session;
  }

  // Replaces each broad touch with a run touch per card it names, a worker's
  // or the fleet's every card, and answers the last touch after them.
  async expand(): Promise<Result<ExpandedTouches>> {
    const { rows } = await this.#session.query<{ subject: string; subject_id: string }>(
      `DELETE FROM card_touches WHERE ${BROAD_SUBJECTS} RETURNING subject, subject_id`,
    );
    if (rows.length > 0) this.projected = true;
    const projects = rows.filter((row) => row.subject === 'project').map((row) => row.subject_id);
    const everyCard = rows.some((row) => EVERY_CARD_SUBJECTS.has(row.subject));
    if (rows.length > 0) {
      await this.#session.query(
        `INSERT INTO card_touches (subject, subject_id)
         SELECT 'run', run_id FROM cards WHERE project_id = ANY($1) OR $2 ORDER BY run_id COLLATE "C"`,
        [projects, everyCard],
      );
    }
    const { rows: [last] } = await this.#session.query<{ through: string }>(
      "SELECT coalesce(max(touch_id), 0)::text AS through FROM card_touches",
    );
    const changed = (subject: string) => rows.some((row) => row.subject === subject);
    return ok(Object.freeze({
      touches: rows.length, through: last!.through, workersChanged: changed('worker'), processesChanged: changed('unrecorded-process'),
    }));
  }

  // Removes the oldest card-sized touches up to `through` and answers the
  // cards they name; a broad touch waits for the next expansion.
  async take(limit: number, through: string): Promise<Result<TouchedCards>> {
    const { rows } = await this.#session.query<TouchRow>(
      `DELETE FROM card_touches WHERE touch_id IN (SELECT touch_id FROM card_touches
         WHERE touch_id <= $2::bigint AND NOT ${BROAD_SUBJECTS} ORDER BY touch_id LIMIT $1)
       RETURNING subject, subject_id`, [limit, through],
    );
    if (rows.length === 0) return ok(Object.freeze({ touches: 0, runIds: Object.freeze([]) }));
    this.projected = true;
    const of = (subject: TouchRow['subject']) => rows.filter((row) => row.subject === subject).map((row) => row.subject_id);
    const { rows: cards } = await this.#session.query<{ run_id: string }>(
      `SELECT cards.run_id FROM cards WHERE cards.run_id = ANY($1)
       UNION SELECT cards.run_id FROM ${CARD_LINEAGE} WHERE lineage.run_id = ANY($1) OR lineage.task_id = ANY($2)
         OR lineage.task_id IN (SELECT task_id FROM agent_sessions WHERE session_id = ANY($3))
         OR lineage.task_id IN (SELECT id FROM tasks WHERE admission_id = ANY($4))
       ORDER BY 1`,
      [of('run'), of('task'), of('session'), of('admission')],
    );
    return ok(Object.freeze({ touches: rows.length, runIds: Object.freeze(cards.map((row) => row.run_id as WorkflowRunId)) }));
  }

  async retry(runIds: readonly WorkflowRunId[]): Promise<Result<void>> {
    await this.#session.query("INSERT INTO card_touches (subject, subject_id) SELECT 'run', unnest($1::text[])", [runIds]);
    return ok(undefined);
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

  async lastItem(itemId: NeedsYouItemId): Promise<Result<string | undefined>> {
    const { rows } = await this.#session.query<{ projection: string }>(
      'SELECT projection FROM reconciliation_item_projections WHERE item_id = $1', [itemId],
    );
    return ok(rows[0]?.projection);
  }

  // The first closing time stays; a later projection never moves it.
  async recordItem(item: NeedsYouItem, projection: string): Promise<Result<void>> {
    await this.#session.query(
      `INSERT INTO reconciliation_item_projections (item_id, projection, closed_at) VALUES ($1, $2, $3)
       ON CONFLICT (item_id) DO UPDATE SET projection = EXCLUDED.projection,
         closed_at = coalesce(reconciliation_item_projections.closed_at, EXCLUDED.closed_at)`,
      [item.id, projection, item.state === 'closed' ? item.closedAt : null],
    );
    return ok(undefined);
  }

  async closedAt(itemId: NeedsYouItemId): Promise<Result<Instant | undefined>> {
    const { rows } = await this.#session.query<{ closed_at: Date | null }>(
      'SELECT closed_at FROM reconciliation_item_projections WHERE item_id = $1', [itemId],
    );
    const closedAt = rows[0]?.closed_at;
    return ok(closedAt === undefined || closedAt === null ? undefined : instant(closedAt));
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
