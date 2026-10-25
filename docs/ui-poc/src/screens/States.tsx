import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Group,
  Paper,
  ScrollArea,
  SegmentedControl,
  Skeleton,
  Stack,
  Stepper,
  Text,
  Title,
  type MantineColor,
} from '@mantine/core';
import { usePoc } from '../store';
import { PageHeader } from '../ui';

type View = 'first-run' | 'empty' | 'loading' | 'error' | 'reconnecting' | 'no-workers' | 'viewer';

const VIEWS: { value: View; label: string }[] = [
  { value: 'first-run', label: 'First run' },
  { value: 'empty', label: 'Empty board' },
  { value: 'loading', label: 'Loading' },
  { value: 'error', label: 'Load error' },
  { value: 'reconnecting', label: 'Live updates lost' },
  { value: 'no-workers', label: 'No workers' },
  { value: 'viewer', label: 'Read-only' },
];

const SETUP = [
  {
    title: 'Connect source control',
    detail: 'Install the GitHub App on the repositories Taskelith may work on. Tokens are issued per run.',
    action: 'Install GitHub App',
  },
  {
    title: 'Enroll a worker',
    detail:
      'Run the worker on Linux (worker image, Ubuntu 24.04) or macOS 26 with a one-time token. It is admitted automatically after its self-check.',
    action: 'Create enrollment token',
  },
  {
    title: 'Add a harness account',
    detail:
      'Sign in a Claude Code or Codex subscription into the account pool. Subscription auth only; no API keys.',
    action: 'Add account',
  },
  {
    title: 'Create a project',
    detail:
      'Pick the repository and branches. SDLC framework: OpenSpec by default, SpecKit selectable. Auto-merge is on by default.',
    action: 'Create project',
  },
];

const COLUMNS = ['Propose', 'Specify', 'Implement', 'Verify', 'Review', 'Archived'];
const COUNTS = [1, 3, 3, 1, 3, 2];
const NO_WORKER_HINTS = [
  '',
  'Waiting for capacity',
  'Waiting for capacity',
  'Waiting for capacity',
  'Waiting for a reviewer slot',
  '',
];

interface Banner {
  title: string;
  text: string;
  color: MantineColor;
  role: 'status' | 'alert';
  action?: string;
}

function bannerFor(view: View, retried: boolean): Banner | null {
  switch (view) {
    case 'loading':
      return {
        role: 'status',
        color: 'indigo',
        title: 'Loading the board…',
        text: 'Reading tasks, gates and sessions for taskelith.',
      };
    case 'error':
      return retried
        ? {
            role: 'alert',
            color: 'red',
            title: 'Still unreachable',
            text: 'Retried just now. Nothing on the board changes until the control plane answers; agents on workers keep running and report back when it returns.',
            action: 'Retry',
          }
        : {
            role: 'alert',
            color: 'red',
            title: 'Can’t reach the control plane',
            text: 'The board could not load. No data is shown rather than data that may be wrong. Retrying automatically every 10 s.',
            action: 'Retry now',
          };
    case 'reconnecting':
      return {
        role: 'status',
        color: 'orange',
        title: 'Live updates paused · reconnecting',
        text: 'The event stream dropped 40 s ago. The board shows the state as of 14:02; gates and actions are rechecked by the server, so stale buttons cannot pass anything.',
      };
    case 'no-workers':
      return {
        role: 'status',
        color: 'orange',
        title: 'No worker online',
        text: 'Admitted tasks wait for capacity; nothing is reassigned or lost. Enroll a worker or bring one back online.',
        action: 'Open workers',
      };
    case 'viewer':
      return {
        role: 'status',
        color: 'gray',
        title: 'Read-only',
        text: 'You are a viewer on this project. Approvals, settings and merges need a project-maintainer.',
      };
    default:
      return null;
  }
}

function previewCards(loading: boolean, populated: boolean, count: number): number {
  if (loading) return 2;
  return populated ? Math.min(count, 2) : 0;
}

function previewCount(loading: boolean, populated: boolean, count: number): string {
  if (loading) return '…';
  return String(populated ? count : 0);
}

function PreviewBoard({ view }: { view: View }) {
  const loading = view === 'loading';
  const populated = ['reconnecting', 'no-workers', 'viewer'].includes(view);
  return (
    <ScrollArea type="auto" offsetScrollbars>
      <Group gap={12} wrap="nowrap" align="flex-start" aria-busy={loading}>
        {COLUMNS.map((name, i) => {
          const cards = previewCards(loading, populated, COUNTS[i]);
          const hint = view === 'no-workers' ? NO_WORKER_HINTS[i] : '';
          return (
            <Stack key={name} gap="xs" w={200} miw={200}>
              <Group gap={8}>
                <Title order={2} size="h6">
                  {name}
                </Title>
                <Badge size="sm" variant="default">
                  {previewCount(loading, populated, COUNTS[i])}
                </Badge>
              </Group>
              <Paper p={6} radius="md" bg="var(--mantine-color-default-hover)" mih={260}>
                <Stack gap={8}>
                  {Array.from({ length: cards }, (_, n) => (
                    <Paper key={n} withBorder p="sm" radius="md">
                      <Stack gap={8}>
                        <Skeleton height={10} width={n ? '70%' : '85%'} animate={loading} />
                        <Skeleton height={8} width={n ? '55%' : '65%'} animate={loading} />
                        <Skeleton height={8} width="40%" animate={loading} />
                      </Stack>
                    </Paper>
                  ))}
                  {hint ? (
                    <Text size="xs" c="dimmed" ta="center">
                      {hint}
                    </Text>
                  ) : null}
                </Stack>
              </Paper>
            </Stack>
          );
        })}
      </Group>
    </ScrollArea>
  );
}

function FirstRun({ done, onStep }: { done: number; onStep: () => void }) {
  return (
    <Paper withBorder p="lg" radius="md" component="section" aria-label="Set up Taskelith">
      <Stack gap="md">
        <Stack gap={4}>
          <Title order={2} size="h4">
            Set up Taskelith
          </Title>
          <Text size="sm" c="dimmed">
            {done} of 4 done. The board appears once a project exists; agents start once a worker and a
            harness account are ready.
          </Text>
        </Stack>
        <Stepper active={done} orientation="vertical" size="sm">
          {SETUP.map((step, i) => (
            <Stepper.Step
              key={step.title}
              label={step.title}
              description={
                <Stack gap="xs" mt={4}>
                  <Text size="sm" c="dimmed">
                    {step.detail}
                  </Text>
                  {i >= done ? (
                    <Button size="xs" w="fit-content" disabled={i !== done} onClick={onStep}>
                      {step.action}
                    </Button>
                  ) : null}
                </Stack>
              }
            />
          ))}
        </Stepper>
      </Stack>
    </Paper>
  );
}

export function StatesScreen() {
  const { go } = usePoc();
  const [view, setView] = useState<View>('first-run');
  const [setup, setSetup] = useState(1);
  const [retried, setRetried] = useState(false);
  const banner = bannerFor(view, retried);
  const pick = (next: View) => {
    setView(next);
    setRetried(false);
  };
  const step = () => {
    const next = setup + 1;
    setSetup(next);
    if (next === SETUP.length) setView('empty');
  };

  return (
    <Stack gap="md">
      <PageHeader
        title="Board states"
        description="How the board looks before there is data, while it loads, and when something it depends on is missing or unreachable. Pick a state to preview it."
      />
      <Group gap="sm">
        <Text size="sm" c="dimmed" id="state-label">
          State
        </Text>
        <ScrollArea type="never" maw="100%">
          <SegmentedControl
            aria-labelledby="state-label"
            value={view}
            onChange={(v) => pick(v as View)}
            data={VIEWS}
          />
        </ScrollArea>
      </Group>
      {banner ? (
        <Alert role={banner.role} variant="light" color={banner.color} title={banner.title}>
          <Group justify="space-between" gap="sm">
            <Text size="sm">{banner.text}</Text>
            {banner.action ? (
              <Button
                size="xs"
                variant="default"
                onClick={() => (view === 'no-workers' ? go('workers') : setRetried(true))}
              >
                {banner.action}
              </Button>
            ) : null}
          </Group>
        </Alert>
      ) : null}
      {view === 'first-run' ? <FirstRun done={Math.min(setup, SETUP.length)} onStep={step} /> : null}
      {view === 'empty' ? (
        <Paper withBorder p="xl" radius="md" component="section" aria-label="No tasks yet">
          <EmptyState
            title="No tasks yet"
            description="The project is connected, a worker is online and OpenSpec is the default framework. Describe a task or import one from Jira, a GitHub issue, Confluence or a file."
          >
            <EmptyState.Actions>
              <Button onClick={() => go('new-task')}>New task</Button>
              <Button variant="default" onClick={() => go('new-task')}>
                Import
              </Button>
            </EmptyState.Actions>
          </EmptyState>
        </Paper>
      ) : null}
      {view !== 'first-run' && view !== 'error' ? <PreviewBoard view={view} /> : null}
    </Stack>
  );
}
