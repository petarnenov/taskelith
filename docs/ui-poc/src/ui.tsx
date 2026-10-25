import {
  Anchor, Badge, DataList, Group, Loader, Paper, Stack, Text, Title,
  type MantineColor,
} from '@mantine/core';
import type { ReactNode } from 'react';
import { usePoc, type Screen } from './store';

export type SessionState =
  | 'live' | 'approval' | 'instructions' | 'idle'
  | 'stopping' | 'stopped' | 'uncertain' | 'none';

const SESSION: Record<SessionState, { label: string; color: MantineColor; spinning?: boolean }> = {
  live: { label: 'Session live', color: 'teal', spinning: true },
  approval: { label: 'Waiting for you', color: 'orange' },
  instructions: { label: 'Waiting for instructions', color: 'orange' },
  idle: { label: 'Session idle', color: 'gray' },
  stopping: { label: 'Stopping · awaiting proof', color: 'orange', spinning: true },
  stopped: { label: 'Session stopped', color: 'gray' },
  uncertain: { label: 'Ownership uncertain', color: 'red' },
  none: { label: 'No session', color: 'gray' },
};

export function SessionBadge({ state, label, harness }: {
  state: SessionState; label?: string; harness?: string;
}) {
  const look = SESSION[state];
  const text = label ?? look.label;
  return (
    <Group gap="xs" wrap="wrap">
      {look.spinning ? (
        <Badge variant="light" color={look.color}
          leftSection={<Loader size={10} color={look.color} />}>{text}</Badge>
      ) : (
        <Badge variant={state === 'none' ? 'outline' : 'dot'} color={look.color}>{text}</Badge>
      )}
      {harness ? <Text size="xs" c="dimmed">{harness}</Text> : null}
    </Group>
  );
}

export type GateState = 'passed' | 'pending' | 'blocked' | 'failed' | 'stale';

export const GATE: Record<GateState, { label: string; color: MantineColor }> = {
  passed: { label: 'Gate passed', color: 'teal' },
  pending: { label: 'Pending', color: 'gray' },
  blocked: { label: 'Blocked', color: 'orange' },
  failed: { label: 'Failed', color: 'red' },
  stale: { label: 'Stale', color: 'orange' },
};

export function PageHeader({ title, description, crumbs, aside }: {
  title: string; description?: ReactNode; crumbs?: ReactNode; aside?: ReactNode;
}) {
  return (
    <Group justify="space-between" align="flex-start" gap="md" wrap="wrap">
      <Stack gap={6} maw={820}>
        {crumbs}
        <Title order={1} size="h2">{title}</Title>
        {description ? <Text c="dimmed">{description}</Text> : null}
      </Stack>
      {aside}
    </Group>
  );
}

export function ScreenLink({ to, children }: { to: Screen; children: ReactNode }) {
  const { go } = usePoc();
  return (
    <Anchor href={'#' + to} size="sm" onClick={(event) => { event.preventDefault(); go(to); }}>
      {children}
    </Anchor>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text size="xs" fw={600} tt="uppercase" c="dimmed">{children}</Text>;
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
      {file ? <Text size="xs" ff="monospace" c="dimmed" mb={6}>{file}</Text> : null}
      <Stack gap={0}>
        {diff.split('\n').map((line, i) => (
          <Text key={i} size="xs" ff="monospace" c={diffColor(line)}>{line || ' '}</Text>
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
