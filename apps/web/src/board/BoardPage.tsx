import { Alert, Stack, Text, Title } from '@mantine/core';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Outlet, useParams } from 'react-router';
import { LoadingStatus } from '../shell/LoadingStatus';
import type { Project, ReadFailed, ReadFailure } from './board';
import { formatInstant } from './board-labels';
import type { BoardView } from './board-model';
import type { Liveness } from './board-feed';
import { BoardColumns } from './BoardColumns';
import { LoadError, withRequiredRole } from './LoadError';
import { useProjects } from './ProjectsProvider';
import { useLiveBoard, type LiveBoard } from './useLiveBoard';

// What the board hands the task detail drawer of its outlet.
export interface BoardOutlet {
  readonly projectId?: string;
  readonly live: LiveBoard;
  // Takes the focus to the board's heading, while the board is shown.
  readonly focusBoard: () => void;
}

// The landing page: the board of the chosen project and its states
// (product ports section 3.5); it never shows task data it did not read.
export function BoardPage() {
  const { view, select, retry } = useProjects();
  const { projectId: addressed } = useParams();
  useEffect(() => {
    if (addressed !== undefined) select(addressed);
  }, [addressed, select]);
  const project = view.status === 'listed' ? view.selected : undefined;
  const live = useLiveBoard(project?.projectId);
  const heading = useRef<HTMLHeadingElement>(null);
  const focusBoard = useCallback(() => heading.current?.focus(), []);
  const outlet = useMemo<BoardOutlet>(
    () => ({ projectId: project?.projectId, live, focusBoard }),
    [project?.projectId, live, focusBoard],
  );
  return (
    <Stack>
      <Title order={1} ref={heading} tabIndex={-1}>
        Project board
      </Title>
      {view.status === 'loading' ? <LoadingStatus text="Loading your projects…" /> : null}
      {view.status === 'unavailable' ? (
        <LoadError title="The projects cannot be read" onRetry={retry}>
          The control plane did not answer with your projects, so no board is shown.
        </LoadError>
      ) : null}
      {view.status === 'listed' && view.selected === undefined ? <FirstRun /> : null}
      {project === undefined ? null : <ProjectBoard project={project} live={live} />}
      <Outlet context={outlet} />
    </Stack>
  );
}

function ProjectBoard({ project, live }: { readonly project: Project; readonly live: LiveBoard }) {
  const { state, retry } = live;
  return (
    <Stack>
      <Text>
        Project{' '}
        <Text span fw={700} inherit>
          {project.name}
        </Text>
      </Text>
      {state.status === 'loading' ? <LoadingStatus text="Loading the board…" /> : null}
      {state.status === 'failed' ? <BoardFailure failure={state.failure} onRetry={retry} /> : null}
      {state.status === 'shown' ? <ShownBoard view={state.view} liveness={state.liveness} /> : null}
    </Stack>
  );
}

function ShownBoard({ view, liveness }: { readonly view: BoardView; readonly liveness: Liveness }) {
  const { board } = view;
  return (
    <Stack>
      {liveness === 'lost' ? (
        <Alert color="indigo" variant="light" title="Live updates lost" role="status">
          The board shows its last known state, as of{' '}
          <time dateTime={view.knownAt}>{formatInstant(view.knownAt)}</time>. Taskelith reconnects on its own.
        </Alert>
      ) : null}
      {board.workersOnline === 0 ? (
        <Alert color="gray" variant="light" title="No workers online" role="status">
          No worker is online, so no task can run until one connects.
        </Alert>
      ) : null}
      {board.callerMayAct ? null : (
        <Alert color="gray" variant="light" title="Read-only" role="status">
          Your role on this project lets you view its board but not act on its tasks.
        </Alert>
      )}
      {board.cards.length === 0 ? (
        <Text c="dimmed">No card yet. Each root workflow run of this project appears here as a card.</Text>
      ) : null}
      <BoardColumns board={board} />
    </Stack>
  );
}

// Decision Q3 of the coordinator: no link to a screen that is not built.
function FirstRun() {
  return (
    <Alert color="indigo" variant="light" title="No project yet" role="status">
      You hold no role on any project, or none exists. The project setup screen is not built yet: an
      installation-owner creates a project through the control plane's createProject operation (POST /projects)
      and assigns its members. The taskelith CLI has no project command. The board shows the project once you hold
      a role on it.
    </Alert>
  );
}

const FAILURES: Readonly<Record<ReadFailure, { title: string; text: string }>> = {
  unauthenticated: {
    title: 'Your session ended',
    text: 'The control plane answered this read as one without a session, which may have ended before a newer one began. Retry reads the board again.',
  },
  unavailable: {
    title: 'The board cannot be loaded',
    text: 'The control plane did not answer with the board, so no task data is shown rather than data that may be wrong.',
  },
  denied: {
    title: 'No access to this board',
    text: 'You hold no role on this project that lets you read its board.',
  },
  'not-found': {
    title: 'Project not found',
    text: 'The control plane knows no such project. Choose another project.',
  },
};

// An unauthenticated answer shows the sign-in page unless a newer session
// showed since the read started, and then this failure stays.
function BoardFailure({ failure, onRetry }: { readonly failure: ReadFailed; readonly onRetry: () => void }) {
  const { title, text } = FAILURES[failure.kind];
  return (
    <LoadError title={title} onRetry={onRetry}>
      {withRequiredRole(text, failure)}
    </LoadError>
  );
}
