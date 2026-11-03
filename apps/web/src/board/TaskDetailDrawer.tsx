import { Alert, Drawer, Title } from '@mantine/core';
import { useNavigate, useOutletContext, useParams } from 'react-router';
import { LoadingStatus } from '../shell/LoadingStatus';
import type { ReadFailed, ReadFailure } from './board';
import { formatInstant } from './board-labels';
import type { BoardView } from './board-model';
import type { Liveness } from './board-feed';
import type { BoardOutlet } from './BoardPage';
import { LoadError, withRequiredRole } from './LoadError';
import { TaskDetailView } from './TaskDetailView';
import { useTaskDetail } from './useTaskDetail';

interface LiveCard {
  readonly view: BoardView;
  readonly liveness: Liveness;
}

// The task detail address opens the Drawer over the board, so a reload or
// a link keeps it; closing it leads back to the board.
export function TaskDetailRoute() {
  const { projectId = '', runId = '' } = useParams();
  const { projectId: boardProjectId, state } = useOutletContext<BoardOutlet>();
  const navigate = useNavigate();
  const live = boardProjectId === projectId && state.status === 'shown' ? state : undefined;
  return (
    <TaskDetailDrawer
      key={`${projectId}/${runId}`}
      projectId={projectId}
      runId={runId}
      live={live}
      onClose={() => void navigate('/')}
    />
  );
}

interface TaskDetailDrawerProps {
  readonly projectId: string;
  readonly runId: string;
  readonly live: LiveCard | undefined;
  readonly onClose: () => void;
}

function TaskDetailDrawer({ projectId, runId, live, onClose }: TaskDetailDrawerProps) {
  const { state, retry } = useTaskDetail(projectId, runId, live?.view);
  const title = state.status === 'shown' ? state.detail.card.title : 'Task detail';
  return (
    <Drawer
      opened
      onClose={onClose}
      position="right"
      size="xl"
      title={
        <Title order={2} size="h3">
          {title}
        </Title>
      }
      closeButtonProps={{ 'aria-label': 'Close the task detail' }}
    >
      {state.status === 'loading' ? <LoadingStatus text="Loading the task detail…" /> : null}
      {state.status === 'failed' ? <DetailFailure failure={state.failure} onRetry={retry} /> : null}
      {state.status === 'shown' && live?.liveness === 'lost' ? <LostNotice asOf={state.detail.asOf} /> : null}
      {state.status === 'shown' ? <TaskDetailView detail={state.detail} /> : null}
    </Drawer>
  );
}

function LostNotice({ asOf }: { readonly asOf: string }) {
  return (
    <Alert color="indigo" variant="light" title="Live updates lost" role="status" mb="md">
      The task detail shows its state as of <time dateTime={asOf}>{formatInstant(asOf)}</time>.
      Taskelith reconnects on its own.
    </Alert>
  );
}

const FAILURES: Readonly<Record<ReadFailure, { title: string; text: string }>> = {
  unauthenticated: {
    title: 'Your session ended',
    text: 'The control plane answered this read as one without a session, which may have ended before a newer one began. Retry reads the task detail again.',
  },
  unavailable: {
    title: 'The task detail cannot be loaded',
    text: 'The control plane did not answer with the task detail, so no task data is shown rather than data that may be wrong.',
  },
  denied: {
    title: 'No access to this task',
    text: 'You hold no role on this project that lets you read its tasks.',
  },
  'not-found': {
    title: 'Task not found',
    text: 'The control plane knows no such card in this project.',
  },
};

function DetailFailure({ failure, onRetry }: { readonly failure: ReadFailed; readonly onRetry: () => void }) {
  const { title, text } = FAILURES[failure.kind];
  return (
    <LoadError title={title} onRetry={onRetry}>
      {withRequiredRole(text, failure)}
    </LoadError>
  );
}
