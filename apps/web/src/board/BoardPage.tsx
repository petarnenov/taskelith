import { Alert, Button, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { useReducedMotion } from '@mantine/hooks';
import type { Project, ReadFailed, ReadFailure } from './board';
import { formatInstant } from './board-labels';
import type { BoardView } from './board-model';
import type { Liveness } from './board-feed';
import { BoardColumns } from './BoardColumns';
import { useProjects } from './ProjectsProvider';
import { useLiveBoard } from './useLiveBoard';

// The landing page: the board of the chosen project and its states
// (product ports section 3.5); it never shows task data it did not read.
export function BoardPage() {
  const { view, retry } = useProjects();
  return (
    <Stack>
      <Title order={1}>Project board</Title>
      {view.status === 'loading' ? <Loading text="Loading your projects…" /> : null}
      {view.status === 'unavailable' ? (
        <LoadError title="The projects cannot be read" onRetry={retry}>
          The control plane did not answer with your projects, so no board is shown.
        </LoadError>
      ) : null}
      {view.status === 'listed' && view.selected === undefined ? <FirstRun /> : null}
      {view.status === 'listed' && view.selected !== undefined ? (
        <ProjectBoard key={view.selected.projectId} project={view.selected} />
      ) : null}
    </Stack>
  );
}

function ProjectBoard({ project }: { readonly project: Project }) {
  const { state, retry } = useLiveBoard(project.projectId);
  return (
    <Stack>
      <Text>
        Project{' '}
        <Text span fw={700} inherit>
          {project.name}
        </Text>
      </Text>
      {state.status === 'loading' ? <Loading text="Loading the board…" /> : null}
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
    <Alert color="indigo" variant="light" title="No project yet">
      You hold no role on any project, or none exists. The project setup screen is not built yet: an
      installation-owner creates a project through the control plane's createProject operation (POST /projects)
      and assigns its members. The taskelith CLI has no project command. The board shows the project once you hold
      a role on it.
    </Alert>
  );
}

const FAILURES: Readonly<Record<Exclude<ReadFailure, 'unauthenticated'>, { title: string; text: string }>> = {
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

// An unauthenticated answer already shows the sign-in page.
function BoardFailure({ failure, onRetry }: { readonly failure: ReadFailed; readonly onRetry: () => void }) {
  const { title, text } = FAILURES[failure.kind === 'unauthenticated' ? 'unavailable' : failure.kind];
  return (
    <LoadError title={title} onRetry={onRetry}>
      {withRequiredRole(text, failure)}
    </LoadError>
  );
}

// Wire contracts section 2: a 403 names the role, so the SPA can show it.
function withRequiredRole(text: string, failure: ReadFailed): string {
  if (failure.kind !== 'denied' || failure.requiredRole === undefined) return text;
  return `${text} Reading it needs the role ${failure.requiredRole}.`;
}

interface LoadErrorProps {
  readonly title: string;
  readonly onRetry: () => void;
  readonly children: string;
}

function LoadError({ title, onRetry, children }: LoadErrorProps) {
  return (
    <Stack align="flex-start">
      <Alert color="red" variant="light" title={title}>
        {children}
      </Alert>
      <Button onClick={onRetry}>Retry</Button>
    </Stack>
  );
}

// The theme's reduced motion does not stop the loader, so it is left out.
function Loading({ text }: { readonly text: string }) {
  const reducedMotion = useReducedMotion();
  return (
    <Group gap="sm" role="status" aria-busy="true">
      {reducedMotion ? null : <Loader size="sm" aria-hidden="true" />}
      <Text c="dimmed">{text}</Text>
    </Group>
  );
}
