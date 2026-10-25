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
import { usePoc } from '../store';
import { LaterGate, PageHeader, RoleButton } from '../ui';

type PressureCause =
  | 'disk-floor'
  | 'journal-backlog'
  | 'daemon-memory'
  | 'event-loop-lag'
  | 'unmeasurable-limit';

const PRESSURE_TEXT: Record<PressureCause, string> = {
  'disk-floor': 'free disk below the floor (5 GiB or 10 %)',
  'journal-backlog': 'journal backlog',
  'daemon-memory': 'daemon memory',
  'event-loop-lag': 'event loop lag',
  'unmeasurable-limit': 'a limit cannot be measured',
};

interface Worker {
  workerId: string;
  hostname: string;
  platform: 'linux' | 'darwin';
  architecture: 'x64' | 'arm64';
  packaging: string;
  reachable: boolean;
  revoked?: boolean;
  pressure?: PressureCause;
  harness: string;
  slots: [number, number];
  cpu: [number, number];
  memory: [number, number];
  lastContact: string;
  credentialGeneration: number;
  note: string;
}

const WORKERS: Worker[] = [
  {
    workerId: 'wkr-3f9a',
    hostname: 'mac-01',
    platform: 'darwin',
    architecture: 'x64',
    packaging: 'native',
    reachable: true,
    harness: 'Claude Code · candidate',
    slots: [2, 2],
    cpu: [4000, 8000],
    memory: [8192, 16384],
    lastContact: '3 s ago',
    credentialGeneration: 2,
    note: 'Active attempts: Task admission, Account pool scheduler review',
  },
  {
    workerId: 'wkr-81c2',
    hostname: 'linux-01',
    platform: 'linux',
    architecture: 'x64',
    packaging: 'worker image',
    reachable: true,
    harness: 'Claude Code · not qualified on Linux',
    slots: [2, 2],
    cpu: [4000, 8000],
    memory: [8192, 32768],
    lastContact: '2 s ago',
    credentialGeneration: 1,
    note: 'Active attempts: OpenAPI contracts, Gate and transition rules',
  },
  {
    workerId: 'wkr-5d07',
    hostname: 'linux-02',
    platform: 'linux',
    architecture: 'arm64',
    packaging: 'worker image',
    reachable: true,
    pressure: 'disk-floor',
    harness: 'Codex · not qualified on Linux',
    slots: [2, 2],
    cpu: [4000, 8000],
    memory: [8192, 16384],
    lastContact: '4 s ago',
    credentialGeneration: 1,
    note: 'Admission pressure: no new launches until free disk is above the floor; running attempts continue and nonessential logs are truncated.',
  },
  {
    workerId: 'wkr-c4e1',
    hostname: 'linux-03',
    platform: 'linux',
    architecture: 'x64',
    packaging: 'worker image',
    reachable: false,
    harness: 'Claude Code · not qualified on Linux',
    slots: [1, 2],
    cpu: [2000, 8000],
    memory: [4096, 16384],
    lastContact: '6 min ago',
    credentialGeneration: 1,
    note: 'Evidence store adapter: process state uncertain. The attempt keeps its owner and its reserved capacity until a terminal fact arrives or a maintainer reconciles it.',
  },
];

const PLATFORM: Record<Worker['platform'], string> = { linux: 'Linux (Ubuntu 24.04)', darwin: 'macOS 26' };

interface Account {
  name: string;
  state: string;
  detail: string;
  cooldown?: boolean;
}

const POOLS: { harness: string; used: number; total: number; accounts: Account[]; note?: string }[] = [
  {
    harness: 'Claude Code',
    used: 9,
    total: 16,
    accounts: [
      {
        name: 'claude-acct-1',
        state: '3 of 4 attempts',
        detail: 'mac-01 · includes the Fable 5.1 review of Account pool scheduler',
      },
      { name: 'claude-acct-2', state: '2 of 4 attempts', detail: 'linux-01' },
      {
        name: 'claude-acct-3',
        state: '4 of 4 attempts',
        detail: 'linux-01 · linux-03 attempt held while its process state is uncertain',
      },
      {
        name: 'claude-acct-4',
        state: 'Cooldown · 38 min',
        detail:
          'Its session waits for the cooldown to end or for an operator; it is never moved to another slot',
        cooldown: true,
      },
    ],
    note: 'Reviewer sessions use the same slots as implementers; slots carry allowed projects, not roles.',
  },
  {
    harness: 'Codex',
    used: 4,
    total: 8,
    accounts: [
      { name: 'codex-acct-1', state: '2 of 4 attempts', detail: 'linux-02' },
      { name: 'codex-acct-2', state: '2 of 4 attempts', detail: 'linux-02' },
    ],
  },
];

const QUOTAS = [
  {
    scope: 'Project taskelith',
    kind: 'concurrent attempts',
    held: 4,
    quota: 4,
    note: 'Full: new attempts wait for capacity and retry with backoff.',
  },
  {
    scope: 'Run · Task admission',
    kind: 'concurrent attempts',
    held: 1,
    quota: 2,
    note: 'Reserved at offer, released by a terminal fact or a reconciliation.',
  },
  {
    scope: 'Delegation tree · Task admission',
    kind: 'child attempts',
    held: 3,
    quota: 8,
    note: 'Consumed, not released; depth limit 3.',
  },
  {
    scope: 'Retries · Lint tooling',
    kind: 'automatic retries',
    held: 1,
    quota: 2,
    note: 'Only after a proven-safe failure; an uncertain attempt gets none.',
  },
];

function statusOf(worker: Worker, draining: boolean): { label: string; color: MantineColor }[] {
  const badges: { label: string; color: MantineColor }[] = [];
  if (worker.revoked) badges.push({ label: 'Revoked', color: 'red' });
  badges.push(
    worker.reachable ? { label: 'Reachable', color: 'teal' } : { label: 'Unreachable', color: 'red' },
  );
  if (draining) badges.push({ label: 'Draining', color: 'orange' });
  if (worker.pressure) badges.push({ label: 'Admission pressure', color: 'orange' });
  return badges;
}

function noteColor(worker: Worker): MantineColor {
  if (!worker.reachable) return 'red';
  return worker.pressure ? 'orange' : 'dimmed';
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
      <Text size="xs" c="dimmed" w={70}>
        {label}
      </Text>
      <Progress value={percent} color={color} flex={1} aria-label={label + ' ' + value} />
      <Text size="xs" w={110} ta="right">
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
  const [used, total] = worker.slots;
  return (
    <Card
      withBorder
      radius="md"
      padding="md"
      bd={worker.reachable ? undefined : '1px solid var(--mantine-color-red-light-color)'}
    >
      <Stack gap="sm">
        <Group justify="space-between" align="flex-start">
          <Stack gap={0}>
            <Title order={3} size="h5" ff="monospace">
              {worker.hostname}
            </Title>
            <Text size="xs" c="dimmed">
              {PLATFORM[worker.platform]} · {worker.architecture} · {worker.packaging} · {worker.workerId}
            </Text>
          </Stack>
          <Group gap={4}>
            {statusOf(worker, draining).map((b) => (
              <Badge key={b.label} variant="light" color={b.color}>
                {b.label}
              </Badge>
            ))}
          </Group>
        </Group>
        <Badge variant="default" size="sm" tt="none">
          {worker.harness}
        </Badge>
        <Stack gap={6}>
          <Meter
            label="Slots"
            value={used + ' / ' + total + (worker.reachable ? ' active' : ' held')}
            percent={(used / total) * 100}
            color={worker.reachable ? 'indigo' : 'gray'}
          />
          <Meter
            label="CPU"
            value={worker.cpu[0] + ' / ' + worker.cpu[1] + ' m'}
            percent={(worker.cpu[0] / worker.cpu[1]) * 100}
            color="indigo"
          />
          <Meter
            label="Memory"
            value={worker.memory[0] / 1024 + ' / ' + worker.memory[1] / 1024 + ' GiB'}
            percent={(worker.memory[0] / worker.memory[1]) * 100}
            color="indigo"
          />
          <Text size="xs" c="dimmed">
            Reserved of declared capacity.
          </Text>
        </Stack>
        {worker.pressure ? (
          <Text size="xs" c="orange">
            Cause: {PRESSURE_TEXT[worker.pressure]}
          </Text>
        ) : null}
        <Text size="xs" c={noteColor(worker)}>
          {draining ? 'Draining: running attempts finish, no new work is placed here.' : worker.note}
        </Text>
        <Group gap="xs">
          <Text size="xs" c="dimmed">
            Last contact {worker.lastContact} · credential generation {worker.credentialGeneration}
          </Text>
          {worker.reachable ? (
            <RoleButton
              capability="manage-workers"
              size="xs"
              variant="default"
              ml="auto"
              onClick={onToggleDrain}
            >
              {draining ? 'Resume' : 'Drain'}
            </RoleButton>
          ) : null}
        </Group>
      </Stack>
    </Card>
  );
}

export function WorkersScreen() {
  const { can } = usePoc();
  const [enroll, setEnroll] = useState(false);
  const [draining, setDraining] = useState<string[]>([]);
  const [revoked, setRevoked] = useState<string[]>([]);
  const reachable = WORKERS.filter((w) => w.reachable && !draining.includes(w.workerId)).length;
  const toggleDrain = (id: string) =>
    setDraining(draining.includes(id) ? draining.filter((d) => d !== id) : [...draining, id]);

  return (
    <Stack gap="lg">
      <PageHeader
        title="Workers"
        description="Machines that run agent attempts, and the subscription accounts each harness draws from."
        aside={
          <Group gap="xs">
            <Badge variant="dot" color="teal">
              {reachable} reachable
            </Badge>
            <Badge variant="dot" color="orange">
              {draining.length} draining · 1 under admission pressure
            </Badge>
            <Badge variant="dot" color="red">
              1 unreachable
            </Badge>
            {can('manage-workers') ? (
              <Button aria-expanded={enroll} onClick={() => setEnroll(!enroll)}>
                Enroll worker
              </Button>
            ) : null}
          </Group>
        }
      />
      <Collapse expanded={enroll}>
        <Paper withBorder p="md" radius="md" component="section" aria-label="Enroll a worker">
          <Group gap="xs" mb="sm">
            <Title order={2} size="h5">
              Enroll a worker
            </Title>
            <LaterGate>G2 item 13 · self-check G3 item 27</LaterGate>
          </Group>
          <List type="ordered" size="sm" spacing={6} mb="sm">
            <List.Item>
              Install the worker: the worker image on Ubuntu 24.04 LTS (x86_64 or arm64), or natively on macOS
              26 (Apple Silicon or Intel).
            </List.Item>
            <List.Item>Run the command below with a short-lived, single-use enrollment token.</List.Item>
            <List.Item>
              Taskelith checks the token and a common protocol version, then the worker runs its self-check:
              process containment (on Linux, cgroup v2 and cgroup.kill), harness versions, network egress, and
              free disk. When it passes, the worker is admitted automatically.
            </List.Item>
            <List.Item>
              A failed self-check or no common protocol version keeps the worker out of placement and shows
              the reason here.
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
              key={worker.workerId}
              worker={worker}
              draining={draining.includes(worker.workerId)}
              onToggleDrain={() => toggleDrain(worker.workerId)}
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
            Subscription sign-in only · new sessions go to the least-loaded slot
          </Text>
          <LaterGate>G3 items 5, 12, 33</LaterGate>
        </Group>
        <SimpleGrid cols={{ base: 1, md: 2 }}>
          {POOLS.map((pool) => (
            <Card key={pool.harness} withBorder radius="md" padding="md">
              <Stack gap="sm">
                <Group justify="space-between">
                  <Title order={3} size="h5">
                    {pool.harness}
                  </Title>
                  <Badge variant="light" color={pool.used >= pool.total ? 'orange' : 'teal'}>
                    {pool.used} of {pool.total} attempts
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
                          <Text size="xs" fw={600} c={off ? 'dimmed' : account.cooldown ? 'orange' : 'teal'}>
                            {off ? 'Revoked' : account.state}
                          </Text>
                          {!off ? (
                            <RoleButton
                              capability="manage-workers"
                              size="compact-xs"
                              variant="subtle"
                              color="red"
                              ml="auto"
                              onClick={() => setRevoked([...revoked, account.name])}
                            >
                              Revoke
                            </RoleButton>
                          ) : null}
                        </Group>
                        <Text size="xs" c="dimmed">
                          {off ? 'Running attempts finish; no new sessions' : account.detail}
                        </Text>
                      </Stack>
                    );
                  })}
                </Stack>
                {pool.note ? (
                  <Text size="xs" c="dimmed">
                    {pool.note}
                  </Text>
                ) : null}
                <Anchor href="#" size="sm" onClick={(event) => event.preventDefault()}>
                  Add account
                </Anchor>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      </Stack>
      <Stack gap="sm" component="section" aria-label="Capacity quotas">
        <Group gap="sm">
          <Title order={2} size="h4">
            Capacity quotas
          </Title>
          <Text size="sm" c="dimmed">
            Concurrency is reserved before a launch; token and cost usage is only accounted, never reserved
          </Text>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }}>
          {QUOTAS.map((quota) => {
            const full = quota.held >= quota.quota;
            return (
              <Card key={quota.scope} withBorder radius="md" padding="md">
                <Stack gap="xs">
                  <Group justify="space-between">
                    <Title order={3} size="h6">
                      {quota.scope}
                    </Title>
                    <Text size="xs" c="dimmed">
                      {quota.kind}
                    </Text>
                  </Group>
                  <Progress
                    value={(quota.held / quota.quota) * 100}
                    color={full ? 'orange' : 'indigo'}
                    size="lg"
                    aria-label={quota.scope + ' quota'}
                  />
                  <Text size="sm">
                    {quota.held} of {quota.quota}
                  </Text>
                  <Text size="xs" c={full ? 'orange' : 'dimmed'}>
                    {quota.note}
                  </Text>
                </Stack>
              </Card>
            );
          })}
        </SimpleGrid>
        <Alert variant="light" color="gray">
          Usage this week: 41 h agent time estimated, 37 h confirmed. Shown for information; no spend limit is
          enforced.
        </Alert>
      </Stack>
    </Stack>
  );
}
