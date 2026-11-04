import { Anchor, Paper, Stack, Text } from '@mantine/core';
import { Link } from 'react-router';
import { LoadingStatus } from '../shell/LoadingStatus';
import { sessionPath } from '../screens';
import type { AgentSession, AttemptOutcome, TaskEnd, TaskView } from './board';
import { ADMISSION_STATE_LABELS, END_LABELS, formatInstant, OUTCOME_LABELS } from './board-labels';
import { LoadError, withRequiredRole } from './LoadError';
import { ObstacleText } from './ObstacleText';
import { SessionIndicator } from './SessionIndicator';
import type { SessionLinks } from './TaskDetailView';
import { Breakable } from './Breakable';
import { ItemList } from './ItemList';

// Every task of the run and its delegated children, in admission order,
// each with its admission, ownership generation, session, and session links.
export function TaskList({ tasks, links }: { readonly tasks: readonly TaskView[]; readonly links: SessionLinks }) {
  if (tasks.length === 0) return <Text size="sm">No task of this run was admitted yet.</Text>;
  const { state } = links;
  return (
    <Stack gap="sm">
      <ItemList component="ol" gap="sm">
        {tasks.map((task) => (
          <TaskItem key={task.taskId} task={task} links={links} />
        ))}
      </ItemList>
      {state.status === 'loading' ? <LoadingStatus text="Looking up the agent sessions…" /> : null}
      {state.status === 'failed' ? (
        <LoadError title="The agent sessions cannot be listed" onRetry={links.retry}>
          {withRequiredRole('The control plane did not answer with the agent sessions of this run.', state.failure)}
        </LoadError>
      ) : null}
    </Stack>
  );
}

function sessionsOf(links: SessionLinks, taskId: string): readonly AgentSession[] {
  if (links.state.status !== 'listed') return [];
  return links.state.sessions.filter((session) => session.taskId === taskId);
}

function TaskItem({ task, links }: { readonly task: TaskView; readonly links: SessionLinks }) {
  const { admission } = task;
  return (
    <Paper component="li" withBorder p="xs" radius="md">
      <Stack gap={4}>
        <Text size="sm" fw={600} ff="monospace">
          <Breakable text={task.taskId} />
        </Text>
        <Text size="xs" c="dimmed">
          Run <Breakable text={task.taskRunId} />, ownership generation {task.ownershipGeneration}
        </Text>
        {task.delegation === undefined ? null : (
          <Text size="sm">
            Delegated by <Breakable text={task.delegation.parentTaskId} />, depth {task.delegation.depth}
          </Text>
        )}
        <Text size="sm">
          Admission <Breakable text={admission.admissionId} />: {ADMISSION_STATE_LABELS[admission.state]} for stage{' '}
          <Breakable text={admission.stageId} />
          {admission.workItemId === undefined ? null : (
            <>
              , work item <Breakable text={admission.workItemId} />
            </>
          )}
          , policy revision <Breakable text={admission.policyRevision} />
          {admission.dispatchedGeneration === undefined
            ? null
            : `, dispatched generation ${admission.dispatchedGeneration}`}
        </Text>
        <SessionIndicator activity={task.session} />
        {sessionsOf(links, task.taskId).map((session) => (
          <Text key={session.sessionId} size="sm">
            <Anchor component={Link} to={sessionPath(links.projectId, session.sessionId)} inherit>
              Open the <Breakable text={session.harness} /> session <Breakable text={session.sessionId} />
            </Anchor>
          </Text>
        ))}
        {task.obstacle === undefined ? null : <ObstacleText obstacle={task.obstacle} />}
        {task.end === undefined ? null : <EndText end={task.end} />}
      </Stack>
    </Paper>
  );
}

function EndText({ end }: { readonly end: TaskEnd }) {
  const { outcome } = end;
  return (
    <Text size="sm">
      Ended without a merge: {END_LABELS[end.kind]}; attempt <Breakable text={end.attemptId} />{' '}
      <Breakable text={outcomeText(outcome)} />,{' '}
      <time dateTime={outcome.endedAt}>{formatInstant(outcome.endedAt)}</time>
    </Text>
  );
}

function outcomeText(outcome: AttemptOutcome): string {
  if (outcome.kind === 'operator-resolved') return `${OUTCOME_LABELS[outcome.kind]}: ${outcome.evidence}`;
  if (outcome.kind === 'not-started') return OUTCOME_LABELS[outcome.kind];
  const { status } = outcome;
  if (status.kind === 'code') return `exited with code ${status.code}`;
  if (status.kind === 'signal') return `exited on ${status.signal}`;
  return 'exited with an unknown status';
}
