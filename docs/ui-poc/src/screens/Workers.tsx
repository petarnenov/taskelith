import { useState } from 'react';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Code,
  Collapse,
  Group,
  List,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Text,
  Title,
  type MantineColor,
} from '@mantine/core';
import { PageHeader } from '../ui';

interface Worker {
  id: string;
  platform: string;
  status: 'online' | 'lost';
  harness: string;
  slots: [number, number];
  cpu: number;
  disk: number;
  heartbeat: string;
  enrollment: string;
  note: string;
}

const WORKERS: Worker[] = [
  {
    id: 'mac-01',
    platform: 'macOS 26 · Intel x86_64 · native',
    status: 'online',
    harness: 'Claude Code · candidate · implementer and Fable 5.1 reviewer',
    slots: [2, 4],
    cpu: 46,
    disk: 38,
    heartbeat: 'heartbeat 3 s ago',
    enrollment: 'renews in 21 d',
    note: '2 sessions: Task admission, Account pool scheduler',
  },
  {
    id: 'linux-01',
    platform: 'Ubuntu 24.04 · x86_64 · worker image',
    status: 'online',
    harness: 'Claude Code · not qualified on Linux',
    slots: [3, 4],
    cpu: 61,
    disk: 52,
    heartbeat: 'heartbeat 2 s ago',
    enrollment: 'renews in 18 d',
    note: '3 sessions: OpenAPI contracts, Gate and transition rules, Container Compose baseline',
  },
  {
    id: 'linux-02',
    platform: 'Ubuntu 24.04 · arm64 · worker image',
    status: 'online',
    harness: 'Codex · not qualified on Linux',
    slots: [4, 4],
    cpu: 78,
    disk: 81,
    heartbeat: 'heartbeat 4 s ago',
    enrollment: 'renews in 9 d',
    note: 'Disk at 81%: new work is admitted with output truncation for non-essential logs',
  },
  {
    id: 'linux-03',
    platform: 'Ubuntu 24.04 · x86_64 · worker image',
    status: 'lost',
    harness: 'Claude Code · not qualified on Linux',
    slots: [1, 4],
    cpu: 0,
    disk: 0,
    heartbeat: 'last heartbeat 6 min ago',
    enrollment: 'renews in 30 d',
    note: 'Evidence store adapter: state unknown. Not reassigned automatically; its capacity stays reserved until ownership is reconciled.',
  },
];

interface Account {
  name: string;
  state: string;
  detail: string;
  limited?: boolean;
}

const POOLS: {
  harness: string;
  role: string;
  used: number;
  total: number;
  accounts: Account[];
  warning?: string;
}[] = [
  {
    harness: 'Claude Code',
    role: 'implementer',
    used: 6,
    total: 8,
    accounts: [
      { name: 'claude-acct-1', state: '2 of 2 sessions', detail: 'mac-01' },
      { name: 'claude-acct-2', state: '2 of 2 sessions', detail: 'linux-01' },
      {
        name: 'claude-acct-3',
        state: '2 of 2 sessions',
        detail: 'linux-01 · linux-03 session held while contact is lost',
      },
      {
        name: 'claude-acct-4',
        state: 'Rate limited',
        detail:
          'Usage window resets in 38 min · its session waits for the reset or an operator reconciles it; it is never moved to another slot',
        limited: true,
      },
    ],
  },
  {
    harness: 'Codex',
    role: 'implementer',
    used: 4,
    total: 4,
    accounts: [
      { name: 'codex-acct-1', state: '2 of 2 sessions', detail: 'linux-02' },
      { name: 'codex-acct-2', state: '2 of 2 sessions', detail: 'linux-02' },
    ],
  },
  {
    harness: 'Claude Code',
    role: 'reviewer slots · claude-fable-5-1',
    used: 2,
    total: 2,
    accounts: [
      { name: 'claude-acct-5', state: '1 of 1 review', detail: 'Reviewing Account pool scheduler' },
      {
        name: 'claude-acct-6',
        state: '1 of 1 review',
        detail: 'Reviewing a task in another project · pools are shared',
      },
    ],
    warning:
      'Reviewer slots full. Container Compose baseline waits for a reviewer: attempt 2 of 3, then it escalates to you.',
  },
];

const BUDGETS = [
  { scope: 'Project taskelith', limit: 'weekly agent time', confirmed: 55, estimated: 62 },
  { scope: 'Run · Task admission', limit: '4 h per run', confirmed: 50, estimated: 54 },
  { scope: 'Run · Lint tooling', limit: '2 h per run', confirmed: 78, estimated: 86 },
];

function meterColor(percent: number): MantineColor {
  if (percent >= 80) return 'red';
  if (percent >= 60) return 'orange';
  return 'teal';
}

function Meter({
  label,
  value,
  percent,
  color,
}: {
  label: string;
  value: string;
  percent: number;
  color: MantineColor;
}) {
  return (
    <Group gap="sm" wrap="nowrap">
      <Text size="xs" c="dimmed" w={60}>
        {label}
      </Text>
      <Progress value={percent} color={color} flex={1} aria-label={label + ' ' + value} />
      <Text size="xs" w={64} ta="right">
        {value}
      </Text>
    </Group>
  );
}

function WorkerCard({
  worker,
  draining,
  onToggleDrain,
}: {
  worker: Worker;
  draining: boolean;
  onToggleDrain: () => void;
}) {
  const lost = worker.status === 'lost';
  const status = lost
    ? { label: 'Lost contact', color: 'red' }
    : draining
      ? { label: 'Draining', color: 'orange' }
      : { label: 'Online', color: 'teal' };
  const [used, total] = worker.slots;
  const note = draining ? 'Draining: running sessions finish, no new work is admitted.' : worker.note;
  const noteColor = lost ? 'red' : worker.disk >= 80 ? 'orange' : 'dimmed';
  return (
    <Card
      withBorder
      radius="md"
      padding="md"
      bd={lost ? '1px solid var(--mantine-color-red-light-color)' : undefined}
    >
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Stack gap={0}>
            <Title order={3} size="h5" ff="monospace">
              {worker.id}
            </Title>
            <Text size="xs" c="dimmed">
              {worker.platform}
            </Text>
          </Stack>
          <Badge variant="light" color={status.color}>
            {status.label}
          </Badge>
        </Group>
        <Badge variant="default" size="sm" fullWidth={false}>
          {worker.harness}
        </Badge>
        {lost ? (
          <Meter
            label="Sessions"
            value={used + '/' + total + ' held'}
            percent={(used / total) * 100}
            color="gray"
          />
        ) : (
          <Stack gap={6}>
            <Meter
              label="Sessions"
              value={used + '/' + total}
              percent={(used / total) * 100}
              color="indigo"
            />
            <Meter label="CPU" value={worker.cpu + '%'} percent={worker.cpu} color={meterColor(worker.cpu)} />
            <Meter
              label="Disk"
              value={worker.disk + '%'}
              percent={worker.disk}
              color={meterColor(worker.disk)}
            />
          </Stack>
        )}
        <Text size="xs" c={noteColor}>
          {note}
        </Text>
        <Group gap="xs">
          <Text size="xs" c="dimmed">
            {worker.heartbeat} · enrollment {worker.enrollment}
          </Text>
          {!lost ? (
            <Button size="xs" variant="default" ml="auto" onClick={onToggleDrain}>
              {draining ? 'Resume' : 'Drain'}
            </Button>
          ) : null}
        </Group>
      </Stack>
    </Card>
  );
}

export function WorkersScreen() {
  const [enroll, setEnroll] = useState(false);
  const [draining, setDraining] = useState<string[]>([]);
  const [revoked, setRevoked] = useState<string[]>([]);
  const online = WORKERS.filter((w) => w.status === 'online' && !draining.includes(w.id)).length;
  const toggleDrain = (id: string) =>
    setDraining(draining.includes(id) ? draining.filter((d) => d !== id) : [...draining, id]);

  return (
    <Stack gap="lg">
      <PageHeader
        title="Workers"
        description="Machines that run agent sessions, and the subscription accounts each harness draws from."
        aside={
          <Group gap="xs">
            <Badge variant="dot" color="teal">
              {online} online
            </Badge>
            <Badge variant="dot" color="orange">
              {draining.length} draining
            </Badge>
            <Badge variant="dot" color="red">
              1 lost contact
            </Badge>
            <Badge variant="dot" color="teal">
              Recovery epoch 3 · normal operation
            </Badge>
            <Button aria-expanded={enroll} onClick={() => setEnroll(!enroll)}>
              Enroll worker
            </Button>
          </Group>
        }
      />
      <Collapse expanded={enroll}>
        <Paper withBorder p="md" radius="md" component="section" aria-label="Enroll a worker">
          <Title order={2} size="h5" mb="sm">
            Enroll a worker
          </Title>
          <List type="ordered" size="sm" spacing={6} mb="sm">
            <List.Item>
              Install the worker: on Linux, the worker image on Ubuntu 24.04 LTS (x86_64 or arm64); on macOS
              26, natively on Apple Silicon or Intel. Native acceptance of each platform is still pending.
            </List.Item>
            <List.Item>Run the command below. The token works once and expires in 15 min.</List.Item>
            <List.Item>
              Taskelith verifies the token and runs the worker self-check: harness versions, network-egress
              test, free disk. When it passes, the worker is admitted automatically.
            </List.Item>
            <List.Item>
              A failed self-check keeps the worker out of scheduling and shows the reason here.
            </List.Item>
          </List>
          <Code block>taskelith worker enroll --server [YOUR SERVER URL] --token [ONE-TIME TOKEN]</Code>
        </Paper>
      </Collapse>
      <Stack gap="sm" component="section" aria-label="Machines">
        <Title order={2} size="h4">
          Machines
        </Title>
        <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }}>
          {WORKERS.map((worker) => (
            <WorkerCard
              key={worker.id}
              worker={worker}
              draining={draining.includes(worker.id)}
              onToggleDrain={() => toggleDrain(worker.id)}
            />
          ))}
        </SimpleGrid>
      </Stack>
      <Stack gap="sm" component="section" aria-label="Account pools">
        <Group gap="sm">
          <Title order={2} size="h4">
            Account pools
          </Title>
          <Text size="sm" c="dimmed">
            Subscription sign-in only · new sessions go to the least-loaded account
          </Text>
        </Group>
        <SimpleGrid cols={{ base: 1, md: 3 }}>
          {POOLS.map((pool) => {
            const full = pool.used >= pool.total;
            return (
              <Card key={pool.role + pool.harness} withBorder radius="md" padding="md">
                <Stack gap="sm">
                  <Group justify="space-between">
                    <Stack gap={0}>
                      <Title order={3} size="h5">
                        {pool.harness}
                      </Title>
                      <Text size="xs" c="dimmed">
                        {pool.role}
                      </Text>
                    </Stack>
                    <Badge variant="light" color={full ? 'orange' : 'teal'}>
                      {pool.used} of {pool.total} in use
                    </Badge>
                  </Group>
                  <Stack gap={8}>
                    {pool.accounts.map((account) => {
                      const off = revoked.includes(account.name);
                      return (
                        <Stack key={account.name} gap={2}>
                          <Group gap="xs" wrap="nowrap">
                            <Text size="sm" ff="monospace">
                              {account.name}
                            </Text>
                            <Text size="xs" fw={600} c={off ? 'dimmed' : account.limited ? 'red' : 'orange'}>
                              {off ? 'Revoked' : account.state}
                            </Text>
                            {!off ? (
                              <Button
                                size="compact-xs"
                                variant="subtle"
                                color="red"
                                ml="auto"
                                onClick={() => setRevoked([...revoked, account.name])}
                              >
                                Revoke
                              </Button>
                            ) : null}
                          </Group>
                          <Text size="xs" c="dimmed">
                            {off ? 'Running sessions finish; no new sessions' : account.detail}
                          </Text>
                        </Stack>
                      );
                    })}
                  </Stack>
                  <Anchor href="#" size="sm" onClick={(event) => event.preventDefault()}>
                    Add account
                  </Anchor>
                  {pool.warning ? (
                    <Alert variant="light" color="orange" p="xs">
                      <Text size="xs">{pool.warning}</Text>
                    </Alert>
                  ) : null}
                </Stack>
              </Card>
            );
          })}
        </SimpleGrid>
      </Stack>
      <Stack gap="sm" component="section" aria-label="Budgets">
        <Group gap="sm">
          <Title order={2} size="h4">
            Budgets
          </Title>
          <Text size="sm" c="dimmed">
            Estimated usage is reserved before a launch and released only when usage is confirmed
          </Text>
        </Group>
        <SimpleGrid cols={{ base: 1, md: 3 }}>
          {BUDGETS.map((budget) => {
            const near = budget.estimated >= 80;
            return (
              <Card key={budget.scope} withBorder radius="md" padding="md">
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Title order={3} size="h6">
                      {budget.scope}
                    </Title>
                    <Text size="xs" c="dimmed">
                      {budget.limit}
                    </Text>
                  </Group>
                  <Progress.Root size="lg" aria-label={budget.scope + ' budget'}>
                    <Progress.Section value={budget.confirmed} color={near ? 'orange' : 'indigo'} />
                    <Progress.Section
                      value={budget.estimated - budget.confirmed}
                      color={near ? 'orange.3' : 'indigo.3'}
                    />
                  </Progress.Root>
                  <Text size="sm">
                    {budget.confirmed}% confirmed · {budget.estimated}% estimated
                  </Text>
                  <Text size="xs" c={near ? 'orange' : 'dimmed'}>
                    {near
                      ? 'Near the limit: new attempts for this run wait for a maintainer.'
                      : 'Reserved until usage is confirmed.'}
                  </Text>
                </Stack>
              </Card>
            );
          })}
        </SimpleGrid>
      </Stack>
    </Stack>
  );
}
