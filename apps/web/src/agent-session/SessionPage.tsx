import { Alert, Anchor, Button, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { useReducedMotion } from '@mantine/hooks';
import { Link, useParams } from 'react-router';
import type { AgentSession, ReadFailed, ReadFailure, SessionActivity, TaskDetail } from '../board/board';
import { formatInstant } from '../board/board-labels';
import { Breakable } from '../board/Breakable';
import { LoadError, withRequiredRole } from '../board/LoadError';
import { SessionIndicator } from '../board/SessionIndicator';
import type { TaskDetailState } from '../board/task-detail-feed';
import { useTaskDetail } from '../board/useTaskDetail';
import { identifierOf, taskDetailPath } from '../screens';
import { LoadingStatus } from '../shell/LoadingStatus';
import { Composer } from './Composer';
import type { ShownSession } from './session-feed';
import { TurnTimeline } from './TurnTimeline';
import { useLiveSession, type LiveSession } from './useLiveSession';

// The agent session of its address (decision Q2): the session, its last
// turns with the earlier ones on demand, its task's activity, the composer.
export function SessionPage() {
  const params = useParams();
  const projectId = identifierOf(params.projectId ?? '');
  const sessionId = identifierOf(params.sessionId ?? '');
  const live = useLiveSession(projectId, sessionId);
  const key = `${projectId}/${sessionId}`;
  const { state } = live;
  return (
    <Stack>
      <Title order={1}>
        Agent session <Breakable text={sessionId} />
      </Title>
      <SessionContent key={key} projectId={projectId} live={live} />
      <Composer
        key={`composer ${key}`}
        projectId={projectId}
        sessionId={sessionId}
        session={state.status === 'shown' ? state.view.session : undefined}
        feedFailed={state.status === 'failed'}
        showTurn={live.showTurn}
      />
    </Stack>
  );
}

function SessionContent({ projectId, live }: { readonly projectId: string; readonly live: LiveSession }) {
  const { state } = live;
  if (state.status === 'loading') return <LoadingStatus text="Loading the agent session…" />;
  if (state.status === 'failed') return <SessionFailure failure={state.failure} onRetry={live.retry} />;
  return <ShownSessionView projectId={projectId} shown={state} loadEarlier={live.loadEarlier} />;
}

interface ShownSessionProps {
  readonly projectId: string;
  readonly shown: ShownSession;
  readonly loadEarlier: () => void;
}

function ShownSessionView({ projectId, shown, loadEarlier }: ShownSessionProps) {
  const { view, liveness, snapshot, earlier } = shown;
  const { session } = view;
  const detail = useTaskDetail(projectId, session.runId, { card: view.card, position: view.position, snapshot });
  return (
    <Stack>
      {liveness === 'lost' ? <LostNotice knownAt={view.knownAt} /> : null}
      <SessionSummary projectId={projectId} session={session} />
      <Activity session={session} detail={detail.state} onRetry={detail.retry} />
      <SessionFacts session={session} />
      <Stack component="section" gap="sm" aria-label="Turns">
        <Title order={2} size="h4">
          Turns
        </Title>
        <EarlierTurns before={view.before} earlier={earlier} onLoad={loadEarlier} />
        <TurnTimeline turns={view.turns} />
      </Stack>
    </Stack>
  );
}

function LostNotice({ knownAt }: { readonly knownAt: string }) {
  return (
    <Alert color="indigo" variant="light" title="Live updates lost" role="status">
      The session shows its last known state, as of <time dateTime={knownAt}>{formatInstant(knownAt)}</time>.
      Taskelith reconnects on its own.
    </Alert>
  );
}

function SessionSummary({ projectId, session }: { readonly projectId: string; readonly session: AgentSession }) {
  return (
    <Text size="sm" c="dimmed">
      Harness <Breakable text={session.harness} /> · task <Breakable text={session.taskId} /> · run{' '}
      <Anchor component={Link} to={taskDetailPath(projectId, session.runId)} inherit>
        <Breakable text={session.runId} />
      </Anchor>
    </Text>
  );
}

interface ActivityProps {
  readonly session: AgentSession;
  readonly detail: TaskDetailState;
  readonly onRetry: () => void;
}

// Decision Q1: the activity of the session's task from readTaskDetail,
// read again on each card-changed of its run.
function Activity({ session, detail, onRetry }: ActivityProps) {
  if (detail.status === 'loading') return <LoadingStatus text="Loading the session activity…" />;
  if (detail.status === 'failed') {
    return (
      <LoadError title="The session activity cannot be loaded" onRetry={onRetry}>
        {withRequiredRole(ACTIVITY_FAILURES[detail.failure.kind], detail.failure)}
      </LoadError>
    );
  }
  const activity = activityOf(detail.detail, session.taskId);
  if (activity === undefined) {
    return (
      <Text size="sm">
        The task detail of run <Breakable text={session.runId} /> lists no task <Breakable text={session.taskId} />, so no activity is shown.
      </Text>
    );
  }
  return <SessionIndicator activity={activity} />;
}

function activityOf(detail: TaskDetail, taskId: string): SessionActivity | undefined {
  return detail.tasks.find((task) => task.taskId === taskId)?.session;
}

// The facts of the session's own record: its running generation, limit,
// and handoff; the activity above comes from the task.
function SessionFacts({ session }: { readonly session: AgentSession }) {
  const { runningGeneration, activeAttempt, limit, handoff } = session;
  return (
    <Stack gap={4}>
      <Text size="sm">
        {runningGeneration === undefined ? 'No generation runs' : `Generation ${runningGeneration} runs`}
        {activeAttempt === undefined ? null : (
          <>
            {' '}
            · attempt <Breakable text={activeAttempt.attemptId} />, ownership generation {activeAttempt.ownershipGeneration}
          </>
        )}
      </Text>
      {limit === undefined ? null : (
        <Text size="sm">
          Account limit reached
          {limit.resetsAt === undefined ? null : (
            <>
              , resets at <time dateTime={limit.resetsAt}>{formatInstant(limit.resetsAt)}</time>
            </>
          )}
        </Text>
      )}
      {handoff === undefined ? null : (
        <Text size="sm">
          Handoff: <Breakable text={handoff.evidence} />
          {handoff.takenBy === undefined ? null : (
            <>
              , taken by session <Breakable text={handoff.takenBy} />
            </>
          )}
        </Text>
      )}
    </Stack>
  );
}

interface EarlierTurnsProps {
  readonly before: number;
  readonly earlier: ShownSession['earlier'];
  readonly onLoad: () => void;
}

// Decision Q5: the last window first, and each earlier one on demand. The
// button stays while it loads, so the focus stays; the feed ignores a repeat.
function EarlierTurns({ before, earlier, onLoad }: EarlierTurnsProps) {
  const reducedMotion = useReducedMotion();
  if (before === 0) return null;
  const reading = earlier.status === 'reading';
  return (
    <Group gap="sm" wrap="wrap">
      {earlier.status === 'failed' ? (
        <Alert color="red" variant="light" title="Earlier turns cannot be loaded" role="alert">
          {withRequiredRole(EARLIER_FAILURES[earlier.failure.kind], earlier.failure)}
        </Alert>
      ) : null}
      <Button
        variant="default"
        onClick={onLoad}
        aria-busy={reading}
        leftSection={reading && !reducedMotion ? <Loader size="xs" aria-hidden="true" /> : undefined}
      >
        {earlierLabel(before, earlier)}
      </Button>
    </Group>
  );
}

function earlierLabel(before: number, earlier: ShownSession['earlier']): string {
  if (earlier.status === 'reading') return 'Loading earlier turns…';
  return earlier.status === 'failed' ? 'Retry' : `Load earlier turns (${before} before these)`;
}

const FAILURES: Readonly<Record<ReadFailure, { readonly title: string; readonly text: string }>> = {
  unauthenticated: {
    title: 'Your session ended',
    text: 'The control plane answered this read as one without a session, which may have ended before a newer one began. Retry reads the agent session again.',
  },
  unavailable: {
    title: 'The agent session cannot be loaded',
    text: 'The control plane did not answer with the agent session, so no session data is shown rather than data that may be wrong.',
  },
  denied: {
    title: 'No access to this agent session',
    text: 'You hold no role on this project that lets you read its agent sessions.',
  },
  'not-found': {
    title: 'Agent session not found',
    text: 'The control plane knows no such agent session in this project.',
  },
};

const EARLIER_FAILURES: Readonly<Record<ReadFailure, string>> = {
  unauthenticated: 'The control plane answered the earlier turns read as one without a session. Retry reads them again.',
  unavailable: 'The control plane did not answer with the earlier turns, so none is shown rather than turns that may be wrong.',
  denied: 'You hold no role on this project that lets you read its agent sessions.',
  'not-found': 'The control plane knows no such agent session in this project.',
};

const ACTIVITY_FAILURES: Readonly<Record<ReadFailure, string>> = {
  unauthenticated: 'The control plane answered the task detail read as one without a session. Retry reads it again.',
  unavailable: 'The control plane did not answer with the task detail, which holds the activity of the session’s task.',
  denied: 'You hold no role on this project that lets you read its tasks.',
  'not-found': 'The control plane knows no such card in this project.',
};

function SessionFailure({ failure, onRetry }: { readonly failure: ReadFailed; readonly onRetry: () => void }) {
  const { title, text } = FAILURES[failure.kind];
  return (
    <LoadError title={title} onRetry={onRetry}>
      {withRequiredRole(text, failure)}
    </LoadError>
  );
}
