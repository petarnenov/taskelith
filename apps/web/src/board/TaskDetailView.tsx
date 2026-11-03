import { Badge, Group, List, Stack, Table, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import type { BoardCard, GateView, StageView, TaskDetail, TraceLink, WorkflowRunBinding } from './board';
import {
  COLUMN_LABELS,
  END_LABELS,
  EVIDENCE_KIND_LABELS,
  FRESHNESS_LABELS,
  GATE_LABELS,
  MERGE_GATE_LABELS,
  STAGE_STATE_LABELS,
  WAIT_LABELS,
  WORK_TYPE_LABELS,
} from './board-labels';
import { ObstacleText, stepOf } from './BoardCardView';
import { Breakable } from './Breakable';
import { SessionIndicator } from './SessionIndicator';
import { TaskList } from './TaskList';

// Product ports section 3.7: one readTaskDetail snapshot, with nothing
// shown that the control plane did not answer.
export function TaskDetailView({ detail }: { readonly detail: TaskDetail }) {
  return (
    <Stack gap="lg">
      <CardSummary card={detail.card} />
      <Holdups detail={detail} />
      <Section title="Stages and gates">
        <StageTable stages={detail.stages} />
      </Section>
      <Section title="Traceability">
        <Traceability links={detail.traceability} />
      </Section>
      <Section title="Run binding">
        <RunBinding binding={detail.runBinding} />
      </Section>
      <Section title="Tasks in admission order">
        <TaskList tasks={detail.tasks} />
      </Section>
    </Stack>
  );
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <Stack component="section" gap="xs" aria-label={title}>
      <Title order={3} size="h5">
        {title}
      </Title>
      {children}
    </Stack>
  );
}

function CardSummary({ card }: { readonly card: BoardCard }) {
  return (
    <Stack gap={6}>
      <Text size="sm" c="dimmed">
        {WORK_TYPE_LABELS[card.workType]} · {card.framework.pluginId} {card.framework.pluginVersion} · run{' '}
        {card.runId}
      </Text>
      <Text size="sm">
        {COLUMN_LABELS[card.column].label} · Step: {stepOf(card.stage)} · {STAGE_STATE_LABELS[card.stage.state]}
      </Text>
      <SessionIndicator activity={card.session} />
      {card.integration === 'not-ready' ? null : <Text size="sm">Merge gate: {MERGE_GATE_LABELS[card.integration]}</Text>}
    </Stack>
  );
}

interface BlockedGate {
  readonly stage: StageView;
  readonly gate: GateView & { readonly blockReason: string };
}

function blockedGates(stages: readonly StageView[]): BlockedGate[] {
  return stages.flatMap((stage) =>
    stage.gates.flatMap(({ blockReason, ...gate }) =>
      blockReason === undefined ? [] : [{ stage, gate: { ...gate, blockReason } }],
    ),
  );
}

// The reasons the card does not move: its wait, its placement obstacle,
// the reasons of its blocked gates, and a task end without a merge.
function Holdups({ detail }: { readonly detail: TaskDetail }) {
  const { card } = detail;
  const gates = blockedGates(detail.stages);
  if (card.waitingFor === undefined && card.obstacle === undefined && card.end === undefined && gates.length === 0) {
    return null;
  }
  return (
    <Section title="Why it does not move">
      <List size="sm" spacing={6}>
        {card.waitingFor === undefined ? null : <List.Item>Waits for {WAIT_LABELS[card.waitingFor]}</List.Item>}
        {card.obstacle === undefined ? null : (
          <List.Item>
            <ObstacleText obstacle={card.obstacle} />
          </List.Item>
        )}
        {gates.map(({ stage, gate }) => (
          <List.Item key={`${stage.stageId}/${gate.gateId}`}>
            Gate {gate.gateId} of {stepOf(stage)} is {GATE_LABELS[gate.state].label}: {gate.blockReason}
          </List.Item>
        ))}
        {card.end === undefined ? null : <List.Item>Ended without a merge: {END_LABELS[card.end.kind]}</List.Item>}
      </List>
    </Section>
  );
}

function StageTable({ stages }: { readonly stages: readonly StageView[] }) {
  if (stages.length === 0) return <Text size="sm">The run has no stage yet.</Text>;
  return (
    <Table withTableBorder verticalSpacing={6} fz="sm">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Step</Table.Th>
          <Table.Th>Column</Table.Th>
          <Table.Th>State</Table.Th>
          <Table.Th>Gates</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {stages.map((stage) => (
          <Table.Tr key={stage.stageId}>
            <Table.Td>
              <Breakable text={stepOf(stage)} />
            </Table.Td>
            <Table.Td>{COLUMN_LABELS[stage.column].label}</Table.Td>
            <Table.Td>{STAGE_STATE_LABELS[stage.state]}</Table.Td>
            <Table.Td>
              <Gates gates={stage.gates} />
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

// A stale gate shows as stale until it passes again (product UI rule).
function Gates({ gates }: { readonly gates: readonly GateView[] }) {
  if (gates.length === 0) return <Text size="sm">No gate</Text>;
  return (
    <Stack gap={4}>
      {gates.map((gate) => (
        <Group key={gate.gateId} gap={6} wrap="wrap">
          <Badge variant="dot" color={GATE_LABELS[gate.state].color} tt="none">
            {gate.gateId} {GATE_LABELS[gate.state].label}
          </Badge>
          <Text size="xs" c="dimmed">
            needs {EVIDENCE_KIND_LABELS[gate.requiredEvidence]}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}

function Traceability({ links }: { readonly links: readonly TraceLink[] }) {
  if (links.length === 0) {
    return <Text size="sm">The control plane records no requirement traceability for this run yet.</Text>;
  }
  return (
    <Table withTableBorder verticalSpacing={6} fz="sm">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Requirement</Table.Th>
          <Table.Th>Work items</Table.Th>
          <Table.Th>Attempts</Table.Th>
          <Table.Th>Evidence</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {links.map((link, index) => (
          <Table.Tr key={index}>
            <Table.Td>{link.requirement}</Table.Td>
            <Table.Td>
              <Breakable text={listed(link.workItemIds)} />
            </Table.Td>
            <Table.Td>
              <Breakable text={listed(link.attemptIds)} />
            </Table.Td>
            <Table.Td>
              <Badge variant="dot" color={FRESHNESS_LABELS[link.evidence].color} tt="none">
                {FRESHNESS_LABELS[link.evidence].label}
              </Badge>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function listed(identifiers: readonly string[]): string {
  return identifiers.length === 0 ? 'none' : identifiers.join(', ');
}

const BINDING_ROWS: readonly (readonly [keyof WorkflowRunBinding, string])[] = [
  ['pluginId', 'Framework plugin'],
  ['pluginVersion', 'Plugin version'],
  ['upstreamToolVersion', 'Upstream tool version'],
  ['workflowId', 'Workflow'],
  ['workflowVersion', 'Workflow version'],
  ['workflowDigest', 'Workflow digest'],
  ['configurationRevision', 'Configuration revision'],
  ['policyRevision', 'Policy revision'],
];

function RunBinding({ binding }: { readonly binding: WorkflowRunBinding }) {
  return (
    <Table withTableBorder verticalSpacing={6} fz="sm">
      <Table.Tbody>
        {BINDING_ROWS.map(([field, label]) => (
          <Table.Tr key={field}>
            <Table.Th scope="row">{label}</Table.Th>
            <Table.Td ff="monospace">
              <Breakable text={binding[field]} />
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
