import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Notification,
  Paper,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { usePoc } from '../store';
import { GATE, PageHeader, SessionBadge } from '../ui';
import { PlusIcon } from '../icons';
import { COLUMNS, conflictFiles, mergeSteps, type Framework, type Task } from './board-data';
import {
  NO_PROGRESS,
  currentTasks,
  isMergeReady,
  laneKey,
  mergeStepOf,
  type BoardProgress,
  type BoardTask,
  type GroupBy,
} from './board-model';
import { SettingsDrawer, TaskDrawer } from './BoardDrawers';

const COLUMN_WIDTH = 264;
const AUTO_MERGE_DELAY = 6000;
const MERGE_STEP_DELAY = 3500;
const STOP_DELAY = 2500;

type Panel = { kind: 'task'; id: string } | { kind: 'settings' } | null;

function useBoardFlow() {
  const { decisions, decide } = usePoc();
  const [progress, setProgress] = useState<BoardProgress>(NO_PROGRESS);
  const [autoMerge, setAutoMerge] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const timers = useRef(new Set<number>());
  const tasks = currentTasks(progress, decisions);
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  };

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const update = (change: (p: BoardProgress) => Partial<BoardProgress>) =>
    setProgress((p) => ({ ...p, ...change(p) }));

  const finishMerge = (task: Task) => {
    const [harness, worker] = task.harness.split(' · ');
    const files = conflictFiles(task).length;
    update((p) => ({ merged: [...p.merged, task.id], mergeFlow: omit(p.mergeFlow, task.id) }));
    setToast(
      'Merged ' +
        task.pr +
        ' after ' +
        harness +
        ' resolved ' +
        files +
        ' conflicts and the resolution passed review: ' +
        task.change +
        ' is archived and the session on ' +
        worker +
        ' was stopped.',
    );
  };

  const returnToSpecify = (task: Task) => {
    const harness = task.harness.split(' · ')[0];
    update((p) => ({ returned: [...p.returned, task.id], mergeFlow: omit(p.mergeFlow, task.id) }));
    setToast(
      task.pr +
        ' not merged: ' +
        task.change +
        ' conflicts with a contract change on dev. Returned to Specify; ' +
        harness +
        ' reconciles the spec without waiting for you.',
    );
  };

  const advanceMerge = (task: Task, step: number) => {
    if (step < mergeSteps(task).length) {
      update((p) => ({ mergeFlow: { ...p.mergeFlow, [task.id]: step } }));
      later(() => advanceMerge(task, step + 1), MERGE_STEP_DELAY);
    } else if (task.conflict === 'semantic') returnToSpecify(task);
    else finishMerge(task);
  };

  const startMerge = (task: Task) => advanceMerge(task, 0);

  const merging = Object.keys(progress.mergeFlow).length > 0;
  const candidate = tasks.find(isMergeReady);
  useEffect(() => {
    if (!autoMerge || merging || !candidate) return undefined;
    const timer = window.setTimeout(() => startMerge(candidate), AUTO_MERGE_DELAY);
    return () => clearTimeout(timer);
  }, [autoMerge, merging, candidate?.id]);

  const stopSession = (task: Task) => {
    update((p) => ({ stopping: [...p.stopping, task.id] }));
    later(
      () =>
        update((p) => ({
          stopping: p.stopping.filter((id) => id !== task.id),
          stopped: [...p.stopped, task.id],
        })),
      STOP_DELAY,
    );
  };

  const migrate = (task: Task, framework: Framework) => {
    update((p) => ({ migrated: { ...p.migrated, [task.id]: framework } }));
    setToast(
      task.title +
        ' migrated to ' +
        framework +
        '. A new binding is recorded, the originals are kept, and the invalidated gates run again.',
    );
  };

  const approve = (task: Task, decision: 'approved' | 'denied') => {
    if (task.inboxId) decide(task.inboxId, decision);
  };

  return { tasks, autoMerge, setAutoMerge, toast, setToast, startMerge, stopSession, migrate, approve };
}

function omit<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

function cardBorder(task: BoardTask, selected: boolean): string | undefined {
  if (selected) return '2px solid var(--mantine-primary-color-filled)';
  if (task.approval) return '1px solid var(--mantine-color-orange-light-color)';
  if (task.mergeStep !== undefined || task.returnedFromMerge)
    return '1px solid var(--mantine-color-indigo-light-color)';
  if (task.justArchived) return '1px solid var(--mantine-color-teal-light-color)';
  return undefined;
}

function MergeProgress({ task, onOpenSession }: { task: BoardTask; onOpenSession: () => void }) {
  const step = mergeStepOf(task)!;
  return (
    <Paper withBorder p="xs" radius="sm">
      <Stack gap={4}>
        <Group justify="space-between" gap="xs">
          <Text size="xs" fw={600} c="indigo">
            {step.label}
          </Text>
          <UnstyledButton onClick={onOpenSession}>
            <Text size="xs" c="indigo" td="underline">
              Open session
            </Text>
          </UnstyledButton>
        </Group>
        <Text size="xs" c="dimmed">
          {step.detail}
        </Text>
        {conflictFiles(task).map((path, i) => (
          <Group key={path} gap={6} wrap="nowrap">
            <Badge size="xs" variant="light" color={i < step.resolved ? 'teal' : 'orange'}>
              {i < step.resolved ? 'resolved' : 'open'}
            </Badge>
            <Text size="xs" ff="monospace" truncate>
              {path}
            </Text>
          </Group>
        ))}
      </Stack>
    </Paper>
  );
}

function TaskCard({
  task,
  selected,
  autoMerge,
  onOpen,
  onMerge,
  onOpenSession,
}: {
  task: BoardTask;
  selected: boolean;
  autoMerge: boolean;
  onOpen: () => void;
  onMerge: () => void;
  onOpenSession: () => void;
}) {
  const gate = GATE[task.gate];
  const mergeReady = isMergeReady(task);
  return (
    <Card withBorder padding="sm" radius="md" bd={cardBorder(task, selected)}>
      <Stack gap={8}>
        <Group justify="space-between" align="flex-start" gap="xs" wrap="nowrap">
          <UnstyledButton onClick={onOpen} aria-label={'Open details for ' + task.title}>
            <Text fw={600} size="sm">
              {task.title}
            </Text>
          </UnstyledButton>
          <Badge size="xs" variant="default">
            {task.framework}
          </Badge>
        </Group>
        <Text size="xs" ff="monospace" c="dimmed" truncate>
          {task.change}
        </Text>
        <Text size="xs" c="dimmed">
          Native: {task.native}
        </Text>
        <Group gap={6}>
          <Badge size="sm" variant="light" color={gate.color}>
            {gate.label}
          </Badge>
          <Text size="xs" c="dimmed">
            {task.note}
          </Text>
        </Group>
        {task.approval ? (
          <Button size="xs" variant="light" color="orange" onClick={onOpen}>
            Approval needed: make verify
          </Button>
        ) : null}
        <SessionBadge state={task.session} harness={task.harness} />
        {task.mergeStep !== undefined ? <MergeProgress task={task} onOpenSession={onOpenSession} /> : null}
        {task.returnedFromMerge ? (
          <Alert variant="light" color="indigo" p="xs" title="Returned from merge">
            <Text size="xs">
              Spec conflict with dev. Reconciling automatically, then implement, verify and review run again.
            </Text>
          </Alert>
        ) : null}
        {mergeReady && autoMerge ? (
          <Badge variant="light" color="teal" fullWidth>
            Auto-merge queued · {task.pr}
          </Badge>
        ) : null}
        {mergeReady && !autoMerge ? (
          <Button size="xs" onClick={onMerge}>
            Merge {task.pr}
          </Button>
        ) : null}
      </Stack>
    </Card>
  );
}

export function BoardScreen() {
  const { go, needsYouCount } = usePoc();
  const flow = useBoardFlow();
  const [panel, setPanel] = useState<Panel>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [framework, setFramework] = useState<Framework>('OpenSpec');
  const { tasks } = flow;
  const lanes = [...new Set(tasks.map((task) => laneKey(task, groupBy)))];
  const selected = panel?.kind === 'task' ? tasks.find((task) => task.id === panel.id) : undefined;
  const liveCount = tasks.filter((task) => task.session === 'live').length;

  return (
    <Stack gap="md">
      <PageHeader
        title="Board"
        description="Columns are the platform lifecycle stages every framework maps to; each card shows its framework's native step, or “platform-managed” where the framework has none. Tasks move only when a gate passes. Accept and integrate is the merge gate after Review; merging archives the change and stops its agent session."
        aside={
          <Group gap="sm">
            <Badge size="lg" variant="dot" color="teal">
              {liveCount} sessions live
            </Badge>
            <Button variant="light" color={needsYouCount ? 'orange' : 'teal'} onClick={() => go('inbox')}>
              {needsYouCount} need you
            </Button>
            <Button variant="default" onClick={() => setPanel({ kind: 'settings' })}>
              Auto-merge:&nbsp;
              <Text span fw={700} c={flow.autoMerge ? 'teal' : 'dimmed'} inherit>
                {flow.autoMerge ? 'On' : 'Off'}
              </Text>
            </Button>
            <Button leftSection={<PlusIcon />} onClick={() => go('new-task')}>
              New task
            </Button>
          </Group>
        }
      />
      <Group gap="sm">
        <Text size="sm" c="dimmed" id="group-label">
          Swimlanes
        </Text>
        <SegmentedControl
          aria-labelledby="group-label"
          value={groupBy}
          onChange={(v) => setGroupBy(v as GroupBy)}
          data={[
            { value: 'none', label: 'None' },
            { value: 'framework', label: 'Framework' },
            { value: 'harness', label: 'Harness' },
          ]}
        />
      </Group>
      {flow.toast ? (
        <Notification color="teal" role="status" onClose={() => flow.setToast(null)} withBorder>
          {flow.toast}
        </Notification>
      ) : null}
      <ScrollArea type="auto" offsetScrollbars>
        <Stack gap="md" miw={COLUMNS.length * (COLUMN_WIDTH + 12)}>
          <Group gap={12} wrap="nowrap" align="flex-start">
            {COLUMNS.map((column, i) => (
              <Stack key={column.name} gap={2} w={COLUMN_WIDTH}>
                <Group gap={8}>
                  <Title order={2} size="h5">
                    {column.name}
                  </Title>
                  <Badge size="sm" variant="default" circle>
                    {tasks.filter((task) => task.stage === i).length}
                  </Badge>
                </Group>
                <Text size="xs" c="dimmed">
                  {column.gate}
                </Text>
              </Stack>
            ))}
          </Group>
          {lanes.map((lane) => {
            const laneTasks = tasks.filter((task) => laneKey(task, groupBy) === lane);
            return (
              <Stack
                key={lane}
                gap="xs"
                component="section"
                aria-label={groupBy === 'none' ? 'Board' : lane + ' swimlane'}
              >
                {groupBy !== 'none' ? (
                  <Group gap={8}>
                    <Title order={2} size="h6">
                      {lane}
                    </Title>
                    <Badge size="sm" variant="default">
                      {laneTasks.length}
                    </Badge>
                  </Group>
                ) : null}
                <Group gap={12} wrap="nowrap" align="flex-start">
                  {COLUMNS.map((column, i) => (
                    <Paper
                      key={column.name}
                      w={COLUMN_WIDTH}
                      p={6}
                      radius="md"
                      bg="var(--mantine-color-default-hover)"
                      mih={groupBy === 'none' ? 480 : 80}
                    >
                      <Stack gap={8}>
                        {laneTasks
                          .filter((task) => task.stage === i)
                          .map((task) => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              autoMerge={flow.autoMerge}
                              selected={selected?.id === task.id}
                              onOpen={() => setPanel({ kind: 'task', id: task.id })}
                              onMerge={() => flow.startMerge(task)}
                              onOpenSession={() => go('session')}
                            />
                          ))}
                      </Stack>
                    </Paper>
                  ))}
                </Group>
              </Stack>
            );
          })}
        </Stack>
      </ScrollArea>
      <TaskDrawer task={selected} onClose={() => setPanel(null)} flow={flow} />
      <SettingsDrawer
        opened={panel?.kind === 'settings'}
        onClose={() => setPanel(null)}
        autoMerge={flow.autoMerge}
        onAutoMerge={flow.setAutoMerge}
        framework={framework}
        onFramework={setFramework}
      />
    </Stack>
  );
}

export type BoardFlow = ReturnType<typeof useBoardFlow>;
