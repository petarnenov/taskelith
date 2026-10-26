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
import { GATE, LaterGate, PageHeader, SessionBadge, TARGET_SIZE, deriveSessionStatus } from '../ui';
import { PlusIcon } from '../icons';
import { COLUMNS, conflictFiles, mergeSteps, type Run } from './board-data';
import {
  NO_PROGRESS,
  cardGate,
  columnOf,
  currentRuns,
  isMergeReady,
  laneKey,
  mergeStepOf,
  type BoardProgress,
  type BoardRun,
  type GroupBy,
} from './board-model';
import { SettingsDrawer, RunDrawer } from './BoardDrawers';
import { LiveStatus } from './LiveStatus';

const COLUMN_WIDTH = 264;
const AUTO_MERGE_DELAY = 6000;
const MERGE_STEP_DELAY = 3500;
const STOP_DELAY = 2500;

type Panel = { kind: 'run'; id: string } | { kind: 'settings' } | null;

function useBoardFlow() {
  const { decisions } = usePoc();
  const [progress, setProgress] = useState<BoardProgress>(NO_PROGRESS);
  const [autoMerge, setAutoMerge] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const timers = useRef(new Set<number>());
  const runs = currentRuns(progress, decisions);
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  };

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const update = (change: (p: BoardProgress) => Partial<BoardProgress>) =>
    setProgress((p) => ({ ...p, ...change(p) }));

  const finishMerge = (run: Run) => {
    const [harness, worker] = run.harness.split(' · ');
    update((p) => ({ merged: [...p.merged, run.runId], mergeFlow: omit(p.mergeFlow, run.runId) }));
    setToast(
      'Merged ' +
        run.pr +
        ' after ' +
        harness +
        ' resolved ' +
        conflictFiles(run).length +
        ' conflicts and the resolution passed review: ' +
        run.workItem +
        ' is archived and the session on ' +
        worker +
        ' was stopped.',
    );
  };

  const returnToSpecify = (run: Run) => {
    const harness = run.harness.split(' · ')[0];
    update((p) => ({ returned: [...p.returned, run.runId], mergeFlow: omit(p.mergeFlow, run.runId) }));
    setToast(
      run.pr +
        ' not merged: ' +
        run.workItem +
        ' conflicts with a contract change on dev. Returned to Specify; ' +
        harness +
        ' reconciles the spec without waiting for you.',
    );
  };

  const advanceMerge = (run: Run, step: number) => {
    if (step < mergeSteps(run).length) {
      update((p) => ({ mergeFlow: { ...p.mergeFlow, [run.runId]: step } }));
      later(() => advanceMerge(run, step + 1), MERGE_STEP_DELAY);
    } else if (run.conflict === 'semantic') returnToSpecify(run);
    else finishMerge(run);
  };

  const startMerge = (run: Run) => advanceMerge(run, 0);

  const merging = Object.keys(progress.mergeFlow).length > 0;
  const candidate = runs.find(isMergeReady);
  useEffect(() => {
    if (!autoMerge || merging || !candidate) return undefined;
    const timer = window.setTimeout(() => startMerge(candidate), AUTO_MERGE_DELAY);
    return () => clearTimeout(timer);
  }, [autoMerge, merging, candidate?.runId]);

  const stopSession = (run: Run) => {
    update((p) => ({ stopping: [...p.stopping, run.runId] }));
    if (run.session.reachability === 'unknown') return;
    later(
      () =>
        update((p) => ({
          stopping: p.stopping.filter((id) => id !== run.runId),
          stopped: [...p.stopped, run.runId],
        })),
      STOP_DELAY,
    );
  };

  const reconcile = (run: Run) => {
    update((p) => ({ reconciled: [...p.reconciled, run.runId] }));
    setToast(
      run.title +
        ': reconciled by PP with evidence. The execution ended as operator-resolved and its capacity was released.',
    );
  };

  return { runs, autoMerge, setAutoMerge, toast, setToast, startMerge, stopSession, reconcile };
}

function omit<T>(record: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

function awaitsApproval(run: BoardRun): boolean {
  return run.session.phase === 'running' && run.session.turn === 'awaiting-approval';
}

function cardBorder(run: BoardRun, selected: boolean): string | undefined {
  if (selected) return '2px solid var(--mantine-primary-color-filled)';
  if (awaitsApproval(run) || deriveSessionStatus(run.session).needsReconcile) {
    return '1px solid var(--mantine-color-orange-light-color)';
  }
  if (run.mergeStep !== undefined || run.returnedFromMerge)
    return '1px solid var(--mantine-color-indigo-light-color)';
  if (run.justArchived) return '1px solid var(--mantine-color-teal-light-color)';
  return undefined;
}

function MergeProgress({ run, onOpenSession }: { run: BoardRun; onOpenSession: () => void }) {
  const step = mergeStepOf(run)!;
  return (
    <Paper withBorder p="xs" radius="sm">
      <Stack gap={4}>
        <Group justify="space-between" gap="xs">
          <Text size="xs" fw={600} c="indigo">
            {step.label}
          </Text>
          <UnstyledButton mih={TARGET_SIZE} onClick={onOpenSession}>
            <Text size="xs" c="indigo" td="underline">
              Open session
            </Text>
          </UnstyledButton>
        </Group>
        <Text size="xs" c="dimmed">
          {step.detail}
        </Text>
        {conflictFiles(run).map((path, i) => (
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

function RunCard({
  run,
  selected,
  autoMerge,
  onOpen,
  onMerge,
  onOpenSession,
}: {
  run: BoardRun;
  selected: boolean;
  autoMerge: boolean;
  onOpen: () => void;
  onMerge: () => void;
  onOpenSession: () => void;
}) {
  const { can } = usePoc();
  const gate = GATE[cardGate(run)];
  const mergeReady = isMergeReady(run);
  const status = deriveSessionStatus(run.session);
  return (
    <Card withBorder padding="sm" radius="md" bd={cardBorder(run, selected)}>
      <Stack gap={8}>
        <Group justify="space-between" align="flex-start" gap="xs">
          <UnstyledButton mih={TARGET_SIZE} onClick={onOpen} aria-label={'Open details for ' + run.title}>
            <Text fw={600} size="sm">
              {run.title}
            </Text>
          </UnstyledButton>
          <Badge size="xs" variant="default">
            {run.framework}
          </Badge>
        </Group>
        <Text size="xs" ff="monospace" c="dimmed" truncate>
          {run.workItem}
        </Text>
        <Text size="xs" c="dimmed">
          Stage: {run.at}
        </Text>
        <Group gap={6}>
          <Badge size="sm" variant="light" color={gate.color}>
            {gate.label}
          </Badge>
          <Text size="xs" c="dimmed">
            {run.note}
          </Text>
        </Group>
        {run.laterGate ? <LaterGate>{run.laterGate}</LaterGate> : null}
        {awaitsApproval(run) ? (
          <Button size="xs" variant="light" color="orange" onClick={onOpen}>
            Approval needed: make verify
          </Button>
        ) : null}
        {status.needsReconcile ? (
          <Button size="xs" variant="light" color="red" onClick={onOpen}>
            Needs reconcile
          </Button>
        ) : null}
        <SessionBadge view={run.session} harness={run.harness} />
        {run.mergeStep !== undefined ? <MergeProgress run={run} onOpenSession={onOpenSession} /> : null}
        {run.returnedFromMerge ? (
          <Alert variant="light" color="indigo" p="xs" title="Returned from merge">
            <Text size="xs">
              Spec conflict with dev. Reconciling automatically, then implement, verify and review run again.
            </Text>
          </Alert>
        ) : null}
        {mergeReady && autoMerge ? (
          <Badge variant="light" color="teal" fullWidth>
            Auto-merge queued · {run.pr}
          </Badge>
        ) : null}
        {mergeReady && !autoMerge && can('change-settings') ? (
          <Button size="xs" onClick={onMerge}>
            Merge {run.pr}
          </Button>
        ) : null}
      </Stack>
    </Card>
  );
}

export function BoardScreen() {
  const { go, needsYouCount, can } = usePoc();
  const flow = useBoardFlow();
  const [panel, setPanel] = useState<Panel>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const { runs } = flow;
  const lanes = [...new Set(runs.map((run) => laneKey(run, groupBy)))];
  const selected = panel?.kind === 'run' ? runs.find((run) => run.runId === panel.id) : undefined;
  const liveCount = runs.filter((run) => deriveSessionStatus(run.session).live).length;

  return (
    <Stack gap="md">
      <PageHeader
        title="Board"
        description="One card per workflow run. Columns group the framework's stages by the lifecycle obligation each stage covers; each card names its current stage and the worst state of that stage's gates. Accept and integrate is a platform-added merge step after Review, not a framework stage."
        aside={
          <Group gap="sm">
            <LiveStatus />
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
            {can('submit-task') ? (
              <Button leftSection={<PlusIcon />} onClick={() => go('new-task')}>
                New task
              </Button>
            ) : null}
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
                    {runs.filter((run) => columnOf(run) === i).length}
                  </Badge>
                </Group>
                <Text size="xs" c="dimmed">
                  {column.obligation}
                </Text>
              </Stack>
            ))}
          </Group>
          {lanes.map((lane) => {
            const laneRuns = runs.filter((run) => laneKey(run, groupBy) === lane);
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
                      {laneRuns.length}
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
                        {laneRuns
                          .filter((run) => columnOf(run) === i)
                          .map((run) => (
                            <RunCard
                              key={run.runId}
                              run={run}
                              autoMerge={flow.autoMerge}
                              selected={selected?.runId === run.runId}
                              onOpen={() => setPanel({ kind: 'run', id: run.runId })}
                              onMerge={() => flow.startMerge(run)}
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
      <RunDrawer run={selected} onClose={() => setPanel(null)} flow={flow} />
      <SettingsDrawer
        opened={panel?.kind === 'settings'}
        onClose={() => setPanel(null)}
        autoMerge={flow.autoMerge}
        onAutoMerge={flow.setAutoMerge}
      />
    </Stack>
  );
}

export type BoardFlow = ReturnType<typeof useBoardFlow>;
