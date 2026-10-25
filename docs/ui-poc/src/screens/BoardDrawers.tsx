import { useState, type ReactNode } from 'react';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Code,
  Collapse,
  Divider,
  Drawer,
  Group,
  Paper,
  Stack,
  Switch,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { usePoc } from '../store';
import { Facts, GATE, LaterGate, RoleButton, SectionLabel, SessionBadge, deriveSessionStatus } from '../ui';
import { BINDINGS, SETTINGS_ROWS, WORKFLOWS, conflictFiles } from './board-data';
import {
  admissionKind,
  isMergeReady,
  mergeStepOf,
  stageRows,
  type BoardRun,
  type StageRow,
} from './board-model';
import type { BoardFlow } from './Board';

const EVIDENCE_LABEL = {
  'structural-validation': 'structural validation',
  'semantic-approval': 'semantic approval',
  'platform-record': 'platform record',
};

function DrawerSection({ title, later, children }: { title: string; later?: string; children: ReactNode }) {
  return (
    <Stack gap="xs">
      <Group gap="xs">
        <Title order={3} size="h6">
          {title}
        </Title>
        {later ? <LaterGate>{later}</LaterGate> : null}
      </Group>
      {children}
    </Stack>
  );
}

function StageTable({ run }: { run: BoardRun }) {
  const rows = stageRows(run);
  const reviewIndex = rows.findIndex((row) => row.id === 'review');
  const mergeReady = isMergeReady(run) || run.mergeStep !== undefined;
  const mergeLabel = mergeStepOf(run)?.label ?? (mergeReady ? 'queued for auto-merge' : 'not reached');
  return (
    <Table fz="xs" withTableBorder verticalSpacing={6}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Stage</Table.Th>
          <Table.Th>State</Table.Th>
          <Table.Th>Gates</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((row, i) => (
          <StageRowView
            key={row.id}
            row={row}
            current={row.id === run.at}
            afterRow={
              i === reviewIndex ? (
                <Table.Tr>
                  <Table.Td>
                    <Text size="xs" fw={600}>
                      Merge
                    </Text>
                    <Text size="xs" c="dimmed">
                      platform-added · not a framework stage
                    </Text>
                  </Table.Td>
                  <Table.Td>{mergeReady ? 'in progress' : 'not started'}</Table.Td>
                  <Table.Td>
                    <Text size="xs">auto-merge · {mergeLabel}</Text>
                  </Table.Td>
                </Table.Tr>
              ) : null
            }
          />
        ))}
      </Table.Tbody>
    </Table>
  );
}

function StageRowView({ row, current, afterRow }: { row: StageRow; current: boolean; afterRow: ReactNode }) {
  return (
    <>
      <Table.Tr bg={current ? 'var(--mantine-primary-color-light)' : undefined}>
        <Table.Td>
          <Text size="xs" fw={600} ff="monospace">
            {row.id}
          </Text>
          <Text size="xs" c="dimmed">
            {row.origin === 'native' ? 'native: ' + row.native : 'platform-managed'} ·{' '}
            {row.obligations.join(', ')}
          </Text>
        </Table.Td>
        <Table.Td>{row.state}</Table.Td>
        <Table.Td>
          <Stack gap={4}>
            {row.gates.map((gate) => (
              <Group key={gate.id} gap={6} wrap="nowrap" align="flex-start">
                <Badge size="xs" variant="light" color={GATE[gate.state].color}>
                  {GATE[gate.state].label}
                </Badge>
                <Text size="xs">
                  {EVIDENCE_LABEL[gate.requiredEvidence]} · {gate.label}
                  {gate.verdict ? ' · ' + gate.verdict : ''}
                  {current ? ' · generation ' + gate.generation : ''}
                </Text>
              </Group>
            ))}
          </Stack>
        </Table.Td>
      </Table.Tr>
      {afterRow}
    </>
  );
}

function AdmissionSection({ run }: { run: BoardRun }) {
  const stage = WORKFLOWS[run.framework].stages.find((s) => s.id === run.at)!;
  const kind = admissionKind(stage);
  if (!kind) {
    return (
      <DrawerSection title="Admission">
        <Text size="sm" c="dimmed">
          No admission: {stage.id} is a {stage.origin} {stage.obligations.join(', ')} stage, which admits no
          task.
        </Text>
      </DrawerSection>
    );
  }
  const items = [
    { label: 'Stage', value: stage.id },
    { label: 'Kind', value: kind },
    { label: 'State', value: run.admission?.state ?? 'not admitted yet' },
  ];
  if (run.admission?.invalidatedBy)
    items.push({ label: 'Invalidated by', value: run.admission.invalidatedBy });
  if (run.revision) {
    items.push({ label: 'Artifact', value: run.revision.artifactId });
    items.push({ label: 'Digest', value: run.revision.digest });
    items.push({ label: 'Native reference', value: run.revision.nativeReference });
  }
  return (
    <DrawerSection title="Admission">
      <Facts items={items} />
      <Text size="xs" c="dimmed">
        A changed artifact revision invalidates an unused admission.
      </Text>
    </DrawerSection>
  );
}

function BindingSection({ run }: { run: BoardRun }) {
  const workflow = WORKFLOWS[run.framework];
  const binding = BINDINGS[run.framework];
  return (
    <DrawerSection
      title="Run binding"
      later={run.framework === 'SpecKit' ? 'SpecKit adapter · G4' : undefined}
    >
      <Facts
        items={[
          { label: 'Plugin', value: binding.plugin },
          { label: 'Upstream tool version', value: binding.tool },
          { label: 'Workflow id', value: workflow.id },
          { label: 'Workflow version', value: workflow.version },
          { label: 'Workflow digest', value: binding.digest },
          { label: 'Configuration revision', value: 'config-r7' },
          { label: 'Policy revision', value: 'governance-v3-r12' },
        ]}
      />
      <Text size="xs" c="dimmed">
        Fixed for this run. Moving the run to another framework is a migration that binds a new run (G4).
      </Text>
    </DrawerSection>
  );
}

function ReconcileAction({ run, flow }: { run: BoardRun; flow: BoardFlow }) {
  const [open, setOpen] = useState(false);
  return (
    <Stack gap="xs">
      <RoleButton capability="reconcile" size="xs" color="red" variant="light" onClick={() => setOpen(!open)}>
        Reconcile…
      </RoleButton>
      <Collapse expanded={open}>
        <Alert variant="light" color="red" title="Reconcile this attempt">
          <Stack gap="xs">
            <Text size="sm">
              Records an audited decision with your evidence: the execution ends with an unknown status and
              the outcome operator-resolved, its launch grants are revoked, and its capacity is released. Use
              it only when you know the process on {run.harness.split(' · ')[1]} is gone.
            </Text>
            <Group gap="xs">
              <Button size="xs" color="red" onClick={() => flow.reconcile(run)}>
                Reconcile with evidence
              </Button>
              <Button size="xs" variant="default" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </Group>
          </Stack>
        </Alert>
      </Collapse>
    </Stack>
  );
}

function RuntimeApproval({ run }: { run: BoardRun }) {
  const { decisions, decide } = usePoc();
  const inboxId = run.inboxId;
  const state = inboxId ? decisions[inboxId] : undefined;
  if (!inboxId || run.session.turn !== 'awaiting-approval' || state?.confirmed) return null;
  return (
    <Alert variant="light" color="orange" title="Native approval request">
      <Stack gap="xs">
        <Code>nvm use &amp;&amp; make verify</Code>
        <Text size="xs" c="dimmed">
          Request req-7f2c for attempt #{run.session.attempt ?? 1} · provider generation 3. Runtime approval
          only; it passes no SDLC gate.
        </Text>
        {state ? (
          <Text size="xs">Sending · waiting for the server to confirm…</Text>
        ) : (
          <Group gap="xs">
            <RoleButton
              capability="answer-runtime-request"
              size="xs"
              onClick={() => decide(inboxId, 'approve-once')}
            >
              Approve once
            </RoleButton>
            <RoleButton
              capability="answer-runtime-request"
              size="xs"
              variant="default"
              onClick={() => decide(inboxId, 'deny')}
            >
              Deny
            </RoleButton>
          </Group>
        )}
      </Stack>
    </Alert>
  );
}

function sessionLog(run: BoardRun): string {
  const step = mergeStepOf(run);
  if (step)
    return '▸ git merge origin/dev\n✗ CONFLICT in ' + conflictFiles(run).length + ' files\n▸ ' + step.detail;
  if (run.returnedFromMerge)
    return '▸ returned from merge: spec conflict with dev\n▸ reconciling spec with the new contract';
  if (run.session.phase !== 'running') return '';
  if (run.session.evidence === 'uncertain')
    return '? last observation from ' + run.harness.split(' · ')[1] + ' ' + run.session.lastContact;
  if (run.session.turn === 'awaiting-approval')
    return '▸ task 4 of 9 complete\n▸ request: run nvm use && make verify\n⏸ waiting for approval';
  return '▸ read tasks of ' + run.workItem + '\n▸ edit 3 files\n▸ run tests: 42 passed';
}

function SessionSection({ run, flow }: { run: BoardRun; flow: BoardFlow }) {
  const { go } = usePoc();
  const status = deriveSessionStatus(run.session);
  const log = sessionLog(run);
  const canStop = run.session.phase === 'running' && run.session.cancellation === undefined;
  return (
    <DrawerSection title="Agent session">
      <SessionBadge view={run.session} harness={run.harness || 'Not assigned'} />
      {run.session.phase !== 'none' ? (
        <Text size="xs" c="dimmed">
          Attempt #{run.session.attempt ?? 1} · ownership generation {run.session.ownershipGeneration ?? 1}
        </Text>
      ) : null}
      {log ? <Code block>{log}</Code> : null}
      <RuntimeApproval run={run} />
      {status.needsReconcile ? <ReconcileAction run={run} flow={flow} /> : null}
      <Group gap="sm">
        <Button size="xs" variant="light" onClick={() => go('session')}>
          Open session
        </Button>
        <Anchor href="#" size="sm" onClick={(event) => event.preventDefault()}>
          View evidence
        </Anchor>
        {canStop ? (
          <RoleButton
            capability="stop-or-retry"
            size="xs"
            variant="light"
            color="red"
            ml="auto"
            onClick={() => flow.stopSession(run)}
          >
            {run.session.reachability === 'unknown' ? 'Request stop' : 'Stop session'}
          </RoleButton>
        ) : null}
      </Group>
    </DrawerSection>
  );
}

function RunDetail({ run, flow }: { run: BoardRun; flow: BoardFlow }) {
  return (
    <Stack gap="lg">
      <Stack gap={6}>
        <Group gap={6}>
          <Badge variant="default">{run.framework}</Badge>
          <Badge variant="default" tt="none">
            {run.runId}
          </Badge>
        </Group>
        <Title order={2} size="h3">
          {run.title}
        </Title>
        <Text size="sm" ff="monospace" c="dimmed">
          {run.workItem} · {run.nativeReference}
        </Text>
      </Stack>
      <DrawerSection title="Stages and gates">
        <StageTable run={run} />
        <Text size="xs" c="dimmed">
          A stage passes only when all its gates pass; structural validation never replaces semantic approval.
        </Text>
      </DrawerSection>
      {run.whyNotMoving ? (
        <Alert variant="light" color="orange" title="Why it is not moving">
          {run.whyNotMoving}
        </Alert>
      ) : null}
      <AdmissionSection run={run} />
      <DrawerSection title="Traceability" later="G3 items 15, 17">
        <Text size="sm" c="dimmed">
          Requirements to tasks to attempts, with evidence freshness at the code head.
        </Text>
      </DrawerSection>
      <BindingSection run={run} />
      <DrawerSection title="Framework" later="G4">
        <Group justify="space-between">
          <Text size="sm">{run.framework} · bound to this run</Text>
          <Button size="xs" variant="default" disabled>
            Change framework…
          </Button>
        </Group>
      </DrawerSection>
      <SessionSection run={run} flow={flow} />
    </Stack>
  );
}

export function RunDrawer({
  run,
  onClose,
  flow,
}: {
  run: BoardRun | undefined;
  onClose: () => void;
  flow: BoardFlow;
}) {
  return (
    <Drawer
      opened={!!run}
      onClose={onClose}
      position="right"
      size="xl"
      title={<SectionLabel>Run detail</SectionLabel>}
      closeButtonProps={{ 'aria-label': 'Close panel' }}
    >
      {run ? <RunDetail run={run} flow={flow} /> : null}
    </Drawer>
  );
}

export function SettingsDrawer({
  opened,
  onClose,
  autoMerge,
  onAutoMerge,
}: {
  opened: boolean;
  onClose: () => void;
  autoMerge: boolean;
  onAutoMerge: (on: boolean) => void;
}) {
  const { can } = usePoc();
  const editable = can('change-settings');
  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="lg"
      title={
        <Stack gap={0}>
          <SectionLabel>Project settings</SectionLabel>
          <Title order={2} size="h3">
            taskelith
          </Title>
        </Stack>
      }
      closeButtonProps={{ 'aria-label': 'Close panel' }}
    >
      <Stack gap="md">
        {!editable ? (
          <Alert variant="light" color="gray">
            Read-only: only a project-maintainer changes these settings.
          </Alert>
        ) : null}
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={2}>
            <Text fw={600} size="sm">
              Members
            </Text>
            <Text size="xs" c="dimmed">
              Roles: installation-owner, project-maintainer, project-operator, project-viewer (trust model
              section 3).
            </Text>
          </Stack>
          <LaterGate>G3 item 11</LaterGate>
        </Group>
        <Divider />
        <Paper withBorder p="sm" radius="md">
          <Group justify="space-between" wrap="nowrap">
            <Stack gap={2}>
              <Text fw={600} size="sm">
                SDLC framework
              </Text>
              <Text size="xs" c="dimmed">
                OpenSpec for every project in G3; selecting another framework comes in G4.
              </Text>
            </Stack>
            <LaterGate>G4</LaterGate>
          </Group>
        </Paper>
        <Divider />
        <Switch
          size="md"
          labelPosition="left"
          checked={autoMerge}
          disabled={!editable}
          onChange={(event) => onAutoMerge(event.currentTarget.checked)}
          label="Auto-merge"
          description="Merge the pull request as soon as the last gate passes. On a conflict, the task's harness resolves it and verification re-runs before the merge. Set by a project-maintainer; it is the integration authority for this project (G3 item 23)."
        />
        {SETTINGS_ROWS.map((row) => (
          <Stack key={row.label} gap="md">
            <Divider />
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <Stack gap={2}>
                <Text fw={600} size="sm">
                  {row.label}
                </Text>
                <Text size="xs" c="dimmed">
                  {row.text}
                </Text>
              </Stack>
              <Badge variant="default" miw="fit-content">
                {row.value}
              </Badge>
            </Group>
          </Stack>
        ))}
      </Stack>
    </Drawer>
  );
}
