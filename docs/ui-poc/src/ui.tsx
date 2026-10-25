import {
  Anchor,
  Badge,
  Button,
  DataList,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
  Tooltip,
  type ButtonProps,
  type MantineColor,
} from '@mantine/core';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { ROLE_FOR, usePoc, type Capability, type Screen } from './store';

export type WaitingReason =
  | 'quarantined'
  | 'worker-not-eligible'
  | 'worker-capacity-exhausted'
  | 'project-quota-exhausted'
  | 'run-quota-exhausted'
  | 'provider-concurrency-exhausted'
  | 'control-not-enforceable';

const WAITING_TEXT: Record<WaitingReason, string> = {
  quarantined: 'installation in restore quarantine',
  'worker-not-eligible': 'no eligible worker',
  'worker-capacity-exhausted': 'all worker slots in use',
  'project-quota-exhausted': 'project concurrency quota full',
  'run-quota-exhausted': 'run concurrency quota full',
  'provider-concurrency-exhausted': 'no account slot free',
  'control-not-enforceable': 'a required resource control cannot be enforced',
};

// What the backend knows about an attempt; the badge is derived from it and
// never stored (architecture section 6, invariant 6).
export interface ExecutionView {
  phase: 'none' | 'awaiting-launch' | 'offered' | 'launch-authorized' | 'running' | 'ended';
  reachability: 'reachable' | 'unknown';
  lastContact?: string;
  waitingReason?: WaitingReason;
  evidence?: 'uncertain' | 'termination-unproven' | 'local-history-lost';
  cancellation?: 'requested' | 'not-applied';
  turn?: 'working' | 'awaiting-approval' | 'awaiting-input' | 'idle';
  outcome?: 'exited-0' | 'exited-1' | 'killed' | 'operator-resolved' | 'not-started';
  ownershipGeneration?: number;
}

export interface SessionStatus {
  label: string;
  color: MantineColor;
  spinning: boolean;
  needsReconcile: boolean;
}

const OUTCOME_TEXT: Record<NonNullable<ExecutionView['outcome']>, string> = {
  'exited-0': 'Ended · exit 0',
  'exited-1': 'Ended · exit 1',
  killed: 'Ended · killed after stop',
  'operator-resolved': 'Ended · operator-resolved, outcome unknown',
  'not-started': 'Never started',
};

const status = (
  label: string,
  color: MantineColor,
  spinning = false,
  needsReconcile = false,
): SessionStatus => ({
  label,
  color,
  spinning,
  needsReconcile,
});

function runningStatus(view: ExecutionView): SessionStatus {
  const unreachable = view.reachability === 'unknown';
  const contact = view.lastContact ? ' · last contact ' + view.lastContact : '';
  if (view.evidence === 'uncertain') {
    return status(
      (unreachable ? 'Worker unreachable · ' : '') + 'process state uncertain',
      'red',
      false,
      true,
    );
  }
  if (view.evidence === 'termination-unproven') return status('Termination unproven', 'red', false, true);
  if (view.evidence === 'local-history-lost') return status('Worker history lost', 'red', false, true);
  if (view.cancellation === 'not-applied')
    return status('Stop not applied · adopted process', 'red', false, true);
  if (view.cancellation === 'requested') {
    return unreachable
      ? status('Stop requested · delivered when the worker returns', 'orange')
      : status('Stopping · awaiting proof', 'orange', true);
  }
  if (unreachable) return status('Worker unreachable' + contact, 'orange');
  if (view.turn === 'awaiting-approval') return status('Waiting for you', 'orange');
  if (view.turn === 'awaiting-input') return status('Waiting for your input', 'orange');
  if (view.turn === 'idle') return status('Waiting for the next turn', 'gray');
  return status('Session live', 'teal', true);
}

export function deriveSessionStatus(view: ExecutionView): SessionStatus {
  switch (view.phase) {
    case 'none':
      return status('No session', 'gray');
    case 'awaiting-launch':
      return status('Queued · ' + WAITING_TEXT[view.waitingReason ?? 'worker-not-eligible'], 'gray');
    case 'offered':
      return status('Offered to a worker', 'indigo', true);
    case 'launch-authorized':
      return status('Launching', 'indigo', true);
    case 'running':
      return runningStatus(view);
    case 'ended':
      return status(OUTCOME_TEXT[view.outcome ?? 'exited-0'], 'gray');
  }
}

export function SessionBadge({
  view,
  label,
  harness,
}: {
  view: ExecutionView;
  label?: string;
  harness?: string;
}) {
  const look = deriveSessionStatus(view);
  const text = label ?? look.label;
  return (
    <Group gap="xs" wrap="wrap">
      {look.spinning ? (
        <Badge variant="light" color={look.color} leftSection={<Loader size={10} color={look.color} />}>
          {text}
        </Badge>
      ) : (
        <Badge variant={view.phase === 'none' ? 'outline' : 'dot'} color={look.color}>
          {text}
        </Badge>
      )}
      {harness ? (
        <Text size="xs" c="dimmed">
          {harness}
        </Text>
      ) : null}
    </Group>
  );
}

export type GateState = 'passed' | 'pending' | 'blocked' | 'failed' | 'stale';

export const GATE: Record<GateState, { label: string; color: MantineColor }> = {
  passed: { label: 'Passed', color: 'teal' },
  pending: { label: 'Pending', color: 'gray' },
  blocked: { label: 'Blocked', color: 'orange' },
  failed: { label: 'Failed', color: 'red' },
  stale: { label: 'Stale', color: 'orange' },
};

// Marks what the proof of concept shows ahead of the backend, with the gate or
// plan item that adds it.
export function LaterGate({ children }: { children: ReactNode }) {
  return (
    <Tooltip label="Not built yet; shown as the target design">
      <Badge size="xs" variant="outline" color="gray" tt="none">
        {children}
      </Badge>
    </Tooltip>
  );
}

export function PageHeader({
  title,
  description,
  crumbs,
  aside,
}: {
  title: string;
  description?: ReactNode;
  crumbs?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <Group justify="space-between" align="flex-start" gap="md" wrap="wrap">
      <Stack gap={6} maw={820}>
        {crumbs}
        <Title order={1} size="h2">
          {title}
        </Title>
        {description ? <Text c="dimmed">{description}</Text> : null}
      </Stack>
      {aside}
    </Group>
  );
}

export function ScreenLink({ to, children }: { to: Screen; children: ReactNode }) {
  const { go } = usePoc();
  return (
    <Anchor
      href={'#' + to}
      size="sm"
      onClick={(event) => {
        event.preventDefault();
        go(to);
      }}
    >
      {children}
    </Anchor>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Text size="xs" fw={600} tt="uppercase" c="dimmed">
      {children}
    </Text>
  );
}

function diffColor(line: string): MantineColor | undefined {
  if (line.startsWith('@@')) return 'indigo';
  if (line.startsWith('+')) return 'teal';
  if (line.startsWith('-')) return 'red';
  return undefined;
}

export function DiffBlock({ file, diff }: { file?: string; diff: string }) {
  return (
    <Paper withBorder radius="md" p="xs">
      {file ? (
        <Text size="xs" ff="monospace" c="dimmed" mb={6}>
          {file}
        </Text>
      ) : null}
      <Stack gap={0}>
        {diff.split('\n').map((line, i) => (
          <Text key={i} size="xs" ff="monospace" c={diffColor(line)}>
            {line || ' '}
          </Text>
        ))}
      </Stack>
    </Paper>
  );
}

export function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <DataList size="sm" labelWidth={170}>
      {items.map((item) => (
        <DataList.Item key={item.label}>
          <DataList.ItemLabel>{item.label}</DataList.ItemLabel>
          <DataList.ItemValue>{item.value}</DataList.ItemValue>
        </DataList.Item>
      ))}
    </DataList>
  );
}

type RoleButtonProps = ButtonProps &
  Omit<ComponentPropsWithoutRef<'button'>, keyof ButtonProps> & { capability: Capability };

// An action the current persona's role may not take stays visible but
// disabled, and names the role it needs.
export function RoleButton({ capability, children, onClick, ...props }: RoleButtonProps) {
  const { can } = usePoc();
  if (can(capability)) {
    return (
      <Button {...props} onClick={onClick}>
        {children}
      </Button>
    );
  }
  return (
    <Tooltip label={'Needs ' + ROLE_FOR[capability]}>
      <Button {...props} disabled>
        {children}
      </Button>
    </Tooltip>
  );
}
