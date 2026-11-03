import { Alert, Box, Drawer } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router';
import { identifierOf } from '../screens';
import { LoadingStatus } from '../shell/LoadingStatus';
import type { ReadFailed, ReadFailure } from './board';
import { formatInstant } from './board-labels';
import { Breakable } from './Breakable';
import type { BoardOutlet } from './BoardPage';
import { LoadError, withRequiredRole } from './LoadError';
import { ProjectPicker } from './ProjectPicker';
import type { TaskDetailState } from './task-detail-feed';
import { TaskDetailView } from './TaskDetailView';
import type { LiveBoard } from './useLiveBoard';
import { useTaskDetail } from './useTaskDetail';

// The task detail address opens the Drawer over the board, so a reload or
// a link keeps it; closing it leads back to the board.
export function TaskDetailRoute() {
  const params = useParams();
  const projectId = identifierOf(params.projectId ?? '');
  const runId = identifierOf(params.runId ?? '');
  const outlet = useOutletContext<BoardOutlet>();
  const navigate = useNavigate();
  const board = outlet.projectId === projectId ? outlet.live : undefined;
  useFocusReturnOnLeave(outlet.focusBoard);
  return (
    <TaskDetailDrawer
      key={`${projectId}/${runId}`}
      projectId={projectId}
      runId={runId}
      board={board}
      onClose={() => void navigate('/')}
    />
  );
}

// The Drawer leaves with its route, so Mantine's own focus return, which
// needs it to close while mounted, never runs; this one runs on leaving.
function useFocusReturnOnLeave(focusBoard: () => void): void {
  const [opener] = useState(() => document.activeElement);
  useEffect(
    () => () => {
      if (opener instanceof HTMLElement && opener !== document.body && opener.isConnected) opener.focus();
      else focusBoard();
    },
    [opener, focusBoard],
  );
}

interface TaskDetailDrawerProps {
  readonly projectId: string;
  readonly runId: string;
  // The live board of the detail's project, if the page shows it.
  readonly board: LiveBoard | undefined;
  readonly onClose: () => void;
}

function TaskDetailDrawer({ projectId, runId, board, onClose }: TaskDetailDrawerProps) {
  const boardState = board?.state;
  const shownBoard = boardState?.status === 'shown' ? boardState : undefined;
  const detail = useTaskDetail(projectId, runId, shownBoard);
  const boardFailure = boardState?.status === 'failed' ? boardState.failure : undefined;
  const shown = boardFailure === undefined && detail.state.status === 'shown' ? detail.state.detail : undefined;
  const retryBoth = () => {
    board?.retry();
    detail.retry();
  };
  return (
    <Drawer
      opened
      onClose={onClose}
      position="right"
      size="xl"
      title={<Breakable text={shown?.card.title ?? 'Task detail'} />}
      closeButtonProps={{ 'aria-label': 'Close the task detail' }}
    >
      {/* The modal Drawer hides the header's picker, so it has its own. */}
      <Box mb="md">
        <ProjectPicker />
      </Box>
      {boardFailure === undefined ? (
        <DetailContent state={detail.state} lost={shownBoard?.liveness === 'lost'} onRetry={detail.retry} />
      ) : (
        <DetailFailure failure={boardFailure} texts={BOARD_FAILURES} onRetry={retryBoth} />
      )}
    </Drawer>
  );
}

interface DetailContentProps {
  readonly state: TaskDetailState;
  readonly lost: boolean;
  readonly onRetry: () => void;
}

function DetailContent({ state, lost, onRetry }: DetailContentProps) {
  if (state.status === 'loading') return <LoadingStatus text="Loading the task detail…" />;
  if (state.status === 'failed') return <DetailFailure failure={state.failure} texts={FAILURES} onRetry={onRetry} />;
  return (
    <>
      {lost ? <LostNotice asOf={state.detail.asOf} /> : null}
      <TaskDetailView detail={state.detail} />
    </>
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

type FailureTexts = Readonly<Record<ReadFailure, { readonly title: string; readonly text: string }>>;

const FAILURES: FailureTexts = {
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

// A board that fails under the detail drops it too: its re-read may show
// that the caller lost access, or that the detail can no longer be current.
const BOARD_FAILURES: FailureTexts = {
  ...FAILURES,
  unavailable: {
    title: 'The task detail cannot be kept current',
    text: 'The board under it could not be read again, so no task data is shown rather than data that may be out of date.',
  },
  'not-found': {
    title: 'Project not found',
    text: 'The control plane knows no such project, so no task data is shown.',
  },
};

interface DetailFailureProps {
  readonly failure: ReadFailed;
  readonly texts: FailureTexts;
  readonly onRetry: () => void;
}

function DetailFailure({ failure, texts, onRetry }: DetailFailureProps) {
  const { title, text } = texts[failure.kind];
  return (
    <LoadError title={title} onRetry={onRetry}>
      {withRequiredRole(text, failure)}
    </LoadError>
  );
}
