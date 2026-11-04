import { Badge, Box, Group, Paper, Stack, Table, Text, Title } from '@mantine/core';
import { useId, type ReactNode } from 'react';
import type { CardSessionsState } from '../agent-session/useCardSessions';
import type { BoardCard, GateView, StageView, TaskDetail, TraceLink, WorkflowRunBinding } from './board';
import {
  COLUMN_LABELS,
  END_LABELS,
  EVIDENCE_KIND_LABELS,
  FRESHNESS_LABELS,
  GATE_LABELS,
  MERGE_GATE_LABELS,
  STAGE_STATE_LABELS,
  stepOf,
  WAIT_LABELS,
  WORK_TYPE_LABELS,
} from './board-labels';
import { Breakable } from './Breakable';
import { ItemList } from './ItemList';
import { ObstacleText } from './ObstacleText';
import { SessionIndicator } from './SessionIndicator';
import { TaskList } from './TaskList';

// The agent sessions of the card's tasks, each linked from its task
// (decision Q3 of item 31), with the state of their listing.
export interface SessionLinks {
  readonly projectId: string;
  readonly state: CardSessionsState;
  readonly retry: () => void;
}

// Product ports section 3.7: one readTaskDetail snapshot, with nothing
// shown that the control plane did not answer.
export function TaskDetailView({ detail, links }: { readonly detail: TaskDetail; readonly links: SessionLinks }) {
  return (
    <Stack gap="lg">
      <CardSummary card={detail.card} />
      <Holdups detail={detail} />
      <Section title="Stages and gates">
        <StageList stages={detail.stages} />
      </Section>
      <Section title="Traceability">
        <Traceability links={detail.traceability} />
      </Section>
      <Section title="Run binding">
        <RunBinding binding={detail.runBinding} />
      </Section>
      <Section title="Tasks in admission order">
        <TaskList tasks={detail.tasks} links={links} />
      </Section>
    </Stack>
  );
}

function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  const titleId = useId();
  return (
    <Stack component="section" gap="xs" aria-labelledby={titleId}>
      <Title id={titleId} order={3} size="h5">
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
        {WORK_TYPE_LABELS[card.workType]} · <Breakable text={card.framework.pluginId} />{' '}
        <Breakable text={card.framework.pluginVersion} /> · run <Breakable text={card.runId} />
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
      <ItemList component="ul" gap={6}>
        {card.waitingFor === undefined ? null : <ReasonItem>Waits for {WAIT_LABELS[card.waitingFor]}</ReasonItem>}
        {card.obstacle === undefined ? null : (
          <Box component="li">
            <ObstacleText obstacle={card.obstacle} />
          </Box>
        )}
        {gates.map(({ stage, gate }) => (
          <ReasonItem key={`${stage.stageId}/${gate.gateId}`}>
            Gate <Breakable text={gate.gateId} /> of <Breakable text={stepOf(stage)} /> is{' '}
            {GATE_LABELS[gate.state].label}: <Breakable text={gate.blockReason} />
          </ReasonItem>
        ))}
        {card.end === undefined ? null : <ReasonItem>Ended without a merge: {END_LABELS[card.end.kind]}</ReasonItem>}
      </ItemList>
    </Section>
  );
}

function ReasonItem({ children }: { readonly children: ReactNode }) {
  return (
    <Text component="li" size="sm">
      {children}
    </Text>
  );
}

// Stages and trace links stack rather than form a table, which could not
// fit four columns of long identifiers at phone width ("Design rules").
function StageList({ stages }: { readonly stages: readonly StageView[] }) {
  if (stages.length === 0) return <Text size="sm">The run has no stage yet.</Text>;
  return (
    <ItemList component="ol" gap="xs">
      {stages.map((stage) => (
        <Paper component="li" key={stage.stageId} withBorder p="xs" radius="md">
          <Stack gap={4}>
            <Text size="sm" fw={600}>
              <Breakable text={stepOf(stage)} />
            </Text>
            <Text size="sm">
              {COLUMN_LABELS[stage.column].label} · {STAGE_STATE_LABELS[stage.state]}
            </Text>
            <Gates gates={stage.gates} />
          </Stack>
        </Paper>
      ))}
    </ItemList>
  );
}

// A stale gate shows as stale until it passes again (product UI rule).
function Gates({ gates }: { readonly gates: readonly GateView[] }) {
  if (gates.length === 0) return <Text size="sm">No gate</Text>;
  return (
    <Stack gap={4}>
      {gates.map((gate) => (
        <Group key={gate.gateId} gap={6} wrap="wrap">
          <Text size="sm" ff="monospace">
            <Breakable text={gate.gateId} />
          </Text>
          <Badge variant="dot" color={GATE_LABELS[gate.state].color} tt="none">
            {GATE_LABELS[gate.state].label}
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
    <ItemList component="ul" gap="xs">
      {links.map((link, index) => (
        <Paper component="li" key={index} withBorder p="xs" radius="md">
          <Stack gap={4} align="flex-start">
            <Text size="sm" fw={600}>
              <Breakable text={link.requirement} />
            </Text>
            <Text size="sm">
              Work items: <Breakable text={listed(link.workItemIds)} />
            </Text>
            <Text size="sm">
              Attempts: <Breakable text={listed(link.attemptIds)} />
            </Text>
            <Badge variant="dot" color={FRESHNESS_LABELS[link.evidence].color} tt="none">
              {FRESHNESS_LABELS[link.evidence].label}
            </Badge>
          </Stack>
        </Paper>
      ))}
    </ItemList>
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
