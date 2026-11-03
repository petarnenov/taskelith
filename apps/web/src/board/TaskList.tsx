import { List, Paper, Stack, Text } from '@mantine/core';
import type { AttemptOutcome, TaskEnd, TaskView } from './board';
import { ADMISSION_STATE_LABELS, END_LABELS, formatInstant, OUTCOME_LABELS } from './board-labels';
import { ObstacleText } from './BoardCardView';
import { SessionIndicator } from './SessionIndicator';
import { Breakable } from './Breakable';

// Every task of the run and its delegated children, in admission order,
// each with its admission, ownership generation, and session.
export function TaskList({ tasks }: { readonly tasks: readonly TaskView[] }) {
  if (tasks.length === 0) return <Text size="sm">No task of this run was admitted yet.</Text>;
  return (
    <List type="ordered" size="sm" spacing="sm">
      {tasks.map((task) => (
        <List.Item key={task.taskId}>
          <TaskItem task={task} />
        </List.Item>
      ))}
    </List>
  );
}

function TaskItem({ task }: { readonly task: TaskView }) {
  const { admission } = task;
  return (
    <Paper withBorder p="xs" radius="md">
      <Stack gap={4}>
        <Text size="sm" fw={600} ff="monospace">
          <Breakable text={task.taskId} />
        </Text>
        <Text size="xs" c="dimmed">
          Run <Breakable text={task.taskRunId} />, ownership generation {task.ownershipGeneration}
        </Text>
        {task.delegation === undefined ? null : (
          <Text size="sm">
            Delegated by {task.delegation.parentTaskId}, depth {task.delegation.depth}
          </Text>
        )}
        <Text size="sm">
          Admission {admission.admissionId}: {ADMISSION_STATE_LABELS[admission.state]} for stage {admission.stageId}
          {admission.workItemId === undefined ? '' : `, work item ${admission.workItemId}`}, policy revision{' '}
          {admission.policyRevision}
          {admission.dispatchedGeneration === undefined
            ? ''
            : `, dispatched generation ${admission.dispatchedGeneration}`}
        </Text>
        <SessionIndicator activity={task.session} />
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
      Ended without a merge: {END_LABELS[end.kind]}; attempt {end.attemptId} {outcomeText(outcome)},{' '}
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
