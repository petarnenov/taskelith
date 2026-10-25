import { useState } from 'react';
import {
  Alert, Anchor, Badge, Button, Code, Collapse, Divider, Drawer, Group,
  SegmentedControl, Stack, Switch, Table, Text, Timeline, Title,
} from '@mantine/core';
import { usePoc } from '../store';
import { Facts, GATE, SectionLabel, SessionBadge } from '../ui';
import {
  BINDINGS, COLUMNS, MERGE_ROW, NATIVE_STEPS, SETTINGS_ROWS, conflictFiles, type Framework,
} from './board-data';
import { isMergeReady, mergeStepOf, sessionLog, traceFor, type BoardTask } from './board-model';
import type { BoardFlow } from './Board';

const LIFECYCLE = [
  ...COLUMNS.slice(0, 5).map((column, i) => ({ ...column, position: i })),
  { ...MERGE_ROW, position: 4.5 },
  { ...COLUMNS[5], position: 5 },
];

function stageRows(task: BoardTask) {
  const native = NATIVE_STEPS[task.framework];
  return LIFECYCLE.map((row, i) => {
    const step = native[i];
    const gate = row.stage + ' · ' + row.gate + ' · ' + (step ? 'native: ' + step : 'platform-managed');
    const base = { name: row.name, gate };
    if (task.stage === 5 || row.position < task.stage) return { ...base, label: 'Passed', color: 'teal', done: true };
    if (row.position === 4.5) {
      if (!isMergeReady(task)) return { ...base, label: 'Pending', color: 'gray', done: false };
      const reason = mergeStepOf(task)?.label ?? 'queued for auto-merge';
      return { ...base, label: 'Pending · ' + reason, color: 'indigo', done: false };
    }
    if (row.position === task.stage) {
      const look = GATE[task.gate];
      return { ...base, label: look.label + ' · ' + task.note, color: look.color, done: false };
    }
    return { ...base, label: 'Pending', color: 'gray', done: false };
  });
}

function bindingFacts(task: BoardTask) {
  const b = BINDINGS[task.framework];
  return [
    { label: 'Plugin', value: b.plugin },
    { label: 'Upstream tool version', value: b.tool },
    { label: 'Workflow id', value: b.workflowId },
    { label: 'Workflow version', value: b.workflowVersion },
    { label: 'Workflow digest', value: b.digest },
    { label: 'Configuration revision', value: 'project config r7' },
    { label: 'Policy revision', value: 'governance v3 · r12' },
  ];
}

function admissionFacts(task: BoardTask) {
  return [
    { label: 'Work item', value: task.change },
    { label: 'Artifact revision', value: task.revision ?? '' },
    { label: 'Policy revision', value: 'governance v3 · r12' },
    { label: 'Admission', value: task.stage < 2 ? 'Planning task · admitted without a spec' : 'Implementation · prerequisite gates passed' },
  ];
}

function migrationText(task: BoardTask, other: Framework): string {
  const started = task.stage >= 2;
  return 'Explicit migration to ' + other + ': ' + (started ? 'running work is checkpointed and drained first; ' : '')
    + 'the original artifacts are preserved, mapped copies are validated, lossy mappings are listed, affected approvals are invalidated, and a new binding is recorded next to the old one.'
    + (started ? ' If safe conversion is not possible, the run is kept and a linked successor is created instead.' : '');
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Stack gap="xs">
      <Title order={3} size="h6">{title}</Title>
      {children}
    </Stack>
  );
}

function FrameworkSection({ task, flow }: { task: BoardTask; flow: BoardFlow }) {
  const [open, setOpen] = useState(false);
  const other: Framework = task.framework === 'OpenSpec' ? 'SpecKit' : 'OpenSpec';
  return (
    <DrawerSection title="Framework">
      <Group justify="space-between">
        <Text size="sm">{task.framework} · bound to this run</Text>
        <Button size="xs" variant="default" aria-expanded={open} onClick={() => setOpen(!open)}>Change framework…</Button>
      </Group>
      <Collapse expanded={open}>
        <Alert variant="light" color="indigo">
          <Stack gap="sm">
            <Text size="sm">{migrationText(task, other)}</Text>
            <Group gap="xs">
              <Button size="xs" onClick={() => { flow.migrate(task, other); setOpen(false); }}>Migrate to {other}</Button>
              <Button size="xs" variant="default" onClick={() => setOpen(false)}>Cancel</Button>
            </Group>
          </Stack>
        </Alert>
      </Collapse>
    </DrawerSection>
  );
}

function SessionSection({ task, flow }: { task: BoardTask; flow: BoardFlow }) {
  const { go } = usePoc();
  const log = sessionLog(task, conflictFiles(task).length);
  const canStop = ['live', 'idle', 'approval'].includes(task.session);
  return (
    <DrawerSection title="Agent session">
      <SessionBadge state={task.session} harness={task.harness || 'Not assigned'} />
      {log ? <Code block>{log}</Code> : null}
      {task.approval ? (
        <Alert variant="light" color="orange" title="Native approval request">
          <Stack gap="xs">
            <Code>nvm use &amp;&amp; make verify</Code>
            <Text size="xs" c="dimmed">Runtime approval only. It does not pass any SDLC gate.</Text>
            <Group gap="xs">
              <Button size="xs" onClick={() => flow.approve(task, 'approved')}>Approve once</Button>
              <Button size="xs" variant="default" onClick={() => flow.approve(task, 'denied')}>Deny</Button>
            </Group>
          </Stack>
        </Alert>
      ) : null}
      <Group gap="sm">
        <Button size="xs" variant="light" onClick={() => go('session')}>Open session</Button>
        <Anchor href="#" size="sm" onClick={(event) => event.preventDefault()}>View evidence</Anchor>
        {canStop ? <Button size="xs" variant="light" color="red" ml="auto" onClick={() => flow.stopSession(task)}>Stop session</Button> : null}
      </Group>
    </DrawerSection>
  );
}

function TaskDetail({ task, flow }: { task: BoardTask; flow: BoardFlow }) {
  const gate = GATE[task.gate];
  const rows = stageRows(task);
  const trace = traceFor(task);
  return (
    <Stack gap="lg">
      <Stack gap={6}>
        <Group gap={6}>
          <Badge variant="default">{task.framework}</Badge>
          <Badge variant="light" color={gate.color}>{gate.label}</Badge>
        </Group>
        <Title order={2} size="h3">{task.title}</Title>
        <Text size="sm" ff="monospace" c="dimmed">{task.change}</Text>
      </Stack>
      <DrawerSection title="SDLC gates">
        <Timeline active={rows.filter((row) => row.done).length - 1} bulletSize={14} lineWidth={2}>
          {rows.map((row) => (
            <Timeline.Item key={row.name} color={row.color}
              title={<Group gap={6}><Text size="sm" fw={600}>{row.name}</Text><Text size="xs" c={row.color === 'gray' ? 'dimmed' : row.color}>{row.label}</Text></Group>}>
              <Text size="xs" c="dimmed">{row.gate}</Text>
            </Timeline.Item>
          ))}
        </Timeline>
      </DrawerSection>
      {task.blockedReason ? (
        <Alert variant="light" color="orange" title="Why it is not moving">{task.blockedReason}</Alert>
      ) : null}
      <DrawerSection title="Traceability">
        {trace.length ? (
          <Table fz="xs" withTableBorder>
            <Table.Tbody>
              {trace.map((row) => (
                <Table.Tr key={row.req}>
                  <Table.Td fw={600}>{row.req}</Table.Td>
                  <Table.Td ff="monospace">{row.path}</Table.Td>
                  <Table.Td c={row.color}>{row.state}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : <Text size="sm" c="dimmed">No requirements yet: the spec is not written.</Text>}
      </DrawerSection>
      {task.stage > 0 ? (
        <>
          <DrawerSection title="Run binding">
            <Facts items={bindingFacts(task)} />
            <Text size="xs" c="dimmed">Fixed for this run. A new plugin version or policy revision applies to new runs only.</Text>
          </DrawerSection>
          <DrawerSection title="Admission">
            <Facts items={admissionFacts(task)} />
            <Text size="xs" c="dimmed">A changed artifact revision invalidates an unused admission.</Text>
          </DrawerSection>
        </>
      ) : null}
      {task.stage < 5 ? <FrameworkSection key={task.id} task={task} flow={flow} /> : null}
      <SessionSection task={task} flow={flow} />
    </Stack>
  );
}

export function TaskDrawer({ task, onClose, flow }: {
  task: BoardTask | undefined; onClose: () => void; flow: BoardFlow;
}) {
  return (
    <Drawer opened={!!task} onClose={onClose} position="right" size="lg"
      title={<SectionLabel>Task detail</SectionLabel>} closeButtonProps={{ 'aria-label': 'Close panel' }}>
      {task ? <TaskDetail task={task} flow={flow} /> : null}
    </Drawer>
  );
}

export function SettingsDrawer({ opened, onClose, autoMerge, onAutoMerge, framework, onFramework }: {
  opened: boolean; onClose: () => void;
  autoMerge: boolean; onAutoMerge: (on: boolean) => void;
  framework: Framework; onFramework: (framework: Framework) => void;
}) {
  return (
    <Drawer opened={opened} onClose={onClose} position="right" size="lg"
      title={<Stack gap={0}><SectionLabel>Project settings</SectionLabel><Title order={2} size="h3">taskelith</Title></Stack>}
      closeButtonProps={{ 'aria-label': 'Close panel' }}>
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={2}>
            <Text fw={600} size="sm">Members</Text>
            <Text size="xs" c="dimmed">PP: installation-owner and project-maintainer. Only project-maintainers change these settings, approve SDLC gates or delegate them by policy.</Text>
          </Stack>
          <Anchor href="#" size="sm" onClick={(event) => event.preventDefault()}>Manage</Anchor>
        </Group>
        <Divider />
        <Stack gap={6}>
          <Text fw={600} size="sm" id="framework-label">SDLC framework</Text>
          <Text size="xs" c="dimmed">Default for new tasks in this project, Taskelith included; OpenSpec unless a maintainer picks another. A task can override it at creation. Running tasks keep the framework they are bound to.</Text>
          <SegmentedControl aria-labelledby="framework-label" value={framework} onChange={(v) => onFramework(v as Framework)}
            data={[{ value: 'OpenSpec', label: 'OpenSpec · default' }, { value: 'SpecKit', label: 'SpecKit' }]} />
        </Stack>
        <Divider />
        <Switch size="md" labelPosition="left" checked={autoMerge} onChange={(event) => onAutoMerge(event.currentTarget.checked)}
          label="Auto-merge"
          description="Merge the pull request as soon as the last gate passes. On a conflict, the task's harness resolves it and verification re-runs before the merge. Turn off to merge by hand from the board. Set by a project-maintainer; it is the integration authority for this project." />
        {SETTINGS_ROWS.map((row) => (
          <Stack key={row.label} gap="md">
            <Divider />
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Stack gap={2}>
                <Text fw={600} size="sm">{row.label}</Text>
                <Text size="xs" c="dimmed">{row.text}</Text>
              </Stack>
              <Badge variant="default" miw="fit-content">{row.value}</Badge>
            </Group>
          </Stack>
        ))}
      </Stack>
    </Drawer>
  );
}
