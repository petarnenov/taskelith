import { useState } from 'react';
import { Alert, Badge, Code, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { usePoc, type Capability, type InboxDecision, type InboxId, type Screen } from '../store';
import {
  PageHeader,
  RoleButton,
  ScreenLink,
  SectionLabel,
  LaterGate,
  SessionBadge,
  type ExecutionView,
} from '../ui';
import { CheckIcon } from '../icons';

interface Action {
  label: string;
  primary?: boolean;
  decision: InboxDecision;
  capability: Capability;
  result: string;
  later?: string;
}

interface InboxItem {
  id: InboxId;
  kind: string;
  title: string;
  age: string;
  session: ExecutionView;
  harness: string;
  why: string;
  code?: string;
  identity: string;
  actions: Action[];
}

const NOW: InboxItem[] = [
  {
    id: 'kernel-approval',
    kind: 'Native approval',
    title: 'Task admission · Claude Code on mac-01',
    age: '6 min',
    session: {
      phase: 'running',
      reachability: 'reachable',
      turn: 'awaiting-approval',
      attempt: 2,
      ownershipGeneration: 3,
    },
    harness: 'Claude Code · mac-01',
    why: 'The harness asks to run a command that the project policy does not pre-authorize.',
    code: 'nvm use && make verify',
    identity: 'Request req-7f2c · attempt #2 · provider generation 3 · answered once',
    actions: [
      {
        label: 'Approve once',
        primary: true,
        decision: 'approve-once',
        capability: 'answer-runtime-request',
        result: 'Approved once. The attempt continues.',
      },
      {
        label: 'Always allow in this project',
        decision: 'approve-once',
        capability: 'add-standing-rule',
        result:
          'Approved once and recorded as a standing rule with your name and its scope (this command in this project).',
        later: 'G3 items 8, 23',
      },
      {
        label: 'Deny',
        decision: 'deny',
        capability: 'answer-runtime-request',
        result: 'Denied. The harness waits for instructions.',
      },
    ],
  },
  {
    id: 'codex-spec',
    kind: 'Spec approval',
    title: 'Qualify Codex on Linux',
    age: '22 min',
    session: { phase: 'ended', outcome: 'exited-0', reachability: 'reachable' },
    harness: 'Codex · linux-02',
    why: 'You chose to approve this spec yourself. Structural validation passed; the semantic approval gate waits for you.',
    identity: 'Gate specs-approval · subject specs sha256:51d0…a7c3 · generation 4',
    actions: [
      {
        label: 'Approve spec',
        primary: true,
        decision: 'approved',
        capability: 'approve-gate',
        result: 'Approved. The specs stage can complete.',
      },
      {
        label: 'Reject with a note',
        decision: 'rejected',
        capability: 'approve-gate',
        result: 'Rejected: the gate failed and reopens on the reworked revision.',
      },
    ],
  },
];

const RECONCILE: { title: string; session: ExecutionView; harness: string; status: string } = {
  title: 'Evidence store adapter · linux-03',
  session: {
    phase: 'running',
    reachability: 'unknown',
    lastContact: '6 min ago',
    evidence: 'uncertain',
    attempt: 1,
    ownershipGeneration: 4,
  },
  harness: 'Claude Code · linux-03',
  status:
    'linux-03 can prove neither that the process runs nor that it ended. The attempt keeps its owner, generation 4, and its capacity until a terminal fact arrives or a maintainer reconciles it on the board.',
};

const SOON: {
  title: string;
  session: ExecutionView;
  harness: string;
  status: string;
  trigger: string;
  to: Screen;
}[] = [
  {
    title: 'Container Compose baseline',
    session: { phase: 'ended', outcome: 'exited-0', reachability: 'reachable' },
    harness: 'Claude Code · linux-01',
    status: 'No reviewer slot free. Try 2 of 3 to get a reviewer failed; the next try is in 4 min.',
    trigger: 'Needs you after try 3',
    to: 'reviews',
  },
  {
    title: 'Lint tooling',
    session: { phase: 'running', reachability: 'reachable', turn: 'working' },
    harness: 'Codex · linux-02',
    status: 'Typecheck failed in fix round 2 of 3. Codex is fixing it.',
    trigger: 'Needs you after round 3',
    to: 'session',
  },
];

// The first answer to the spec approval meets a newer revision, as a stale
// screen would; the server's conflict reply makes the user look again.
type SpecConflict = 'not-yet' | 'shown' | 'resolved';

export function InboxScreen() {
  const { decisions, decide, needsYouCount } = usePoc();
  const [results, setResults] = useState<Partial<Record<InboxId, string>>>({});
  const [conflict, setConflict] = useState<SpecConflict>('not-yet');
  const open = NOW.filter((item) => !decisions[item.id]?.confirmed);
  const done = NOW.filter((item) => decisions[item.id]?.confirmed);

  const act = (item: InboxItem, action: Action) => {
    if (item.id === 'codex-spec' && conflict === 'not-yet') {
      setConflict('shown');
      return;
    }
    if (item.id === 'codex-spec') setConflict('resolved');
    setResults({ ...results, [item.id]: action.result });
    decide(item.id, action.decision);
  };

  return (
    <Stack gap="lg">
      <PageHeader
        title="Needs you"
        description="Everything Taskelith could not decide on its own. The rest keeps running without you."
      />
      <Stack gap="sm" component="section" aria-label="Needs you now">
        <SectionLabel>Now · {needsYouCount}</SectionLabel>
        {open.length === 0 ? (
          <Alert color="teal" variant="light" icon={<CheckIcon />}>
            Nothing needs you right now.
          </Alert>
        ) : null}
        {open.map((item) => {
          const sending = !!decisions[item.id];
          return (
            <Paper
              key={item.id}
              withBorder
              p="md"
              radius="md"
              bd="1px solid var(--mantine-color-orange-light-color)"
            >
              <Stack gap="sm">
                <Group gap="xs" wrap="wrap">
                  <Badge variant="light" color="orange">
                    {item.kind}
                  </Badge>
                  {item.id === 'kernel-approval' ? (
                    <LaterGate>native requests · G3 items 4, 13, 18</LaterGate>
                  ) : null}
                  <Title order={3} size="h5" flex={1}>
                    {item.title}
                  </Title>
                  <Text size="xs" c="dimmed">
                    {item.age}
                  </Text>
                </Group>
                <SessionBadge view={item.session} harness={item.harness} />
                <Text size="sm">{item.why}</Text>
                {item.code ? <Code block>{item.code}</Code> : null}
                <Text size="xs" c="dimmed" ff="monospace">
                  {item.identity}
                </Text>
                {item.id === 'codex-spec' && conflict === 'shown' ? (
                  <Alert variant="light" color="orange" title="This changed since you opened it">
                    The server refused the answer with conflict: Codex pushed a new specs revision (generation
                    4 → 5). The view is reloaded; review the new revision and answer again.
                  </Alert>
                ) : null}
                {sending ? (
                  <Text size="sm">Sending · waiting for the server to confirm…</Text>
                ) : (
                  <Group gap="xs">
                    {item.actions.map((action) => (
                      <Group key={action.label} gap={4}>
                        <RoleButton
                          capability={action.capability}
                          variant={action.primary ? 'filled' : 'default'}
                          onClick={() => act(item, action)}
                        >
                          {action.label}
                        </RoleButton>
                        {action.later ? <LaterGate>{action.later}</LaterGate> : null}
                      </Group>
                    ))}
                    <Group ml="auto">
                      <ScreenLink to="board">Open task</ScreenLink>
                    </Group>
                  </Group>
                )}
              </Stack>
            </Paper>
          );
        })}
        <Paper withBorder p="md" radius="md" bd="1px solid var(--mantine-color-red-light-color)">
          <Stack gap="sm">
            <Group gap="xs">
              <Badge variant="light" color="red">
                Reconcile
              </Badge>
              <Title order={3} size="h5">
                {RECONCILE.title}
              </Title>
            </Group>
            <SessionBadge view={RECONCILE.session} harness={RECONCILE.harness} />
            <Text size="sm">{RECONCILE.status}</Text>
            <Group>
              <ScreenLink to="board">Reconcile on the board</ScreenLink>
            </Group>
          </Stack>
        </Paper>
      </Stack>
      <Stack gap="sm" component="section" aria-label="Might need you soon">
        <SectionLabel>Taskelith is handling · might need you</SectionLabel>
        {SOON.map((item) => (
          <Paper key={item.title} withBorder p="sm" radius="md">
            <Group gap="md" wrap="wrap">
              <Text fw={600} size="sm" miw={200} flex="1 1 200px">
                {item.title}
              </Text>
              <SessionBadge view={item.session} harness={item.harness} />
              <Text size="sm" c="dimmed" flex="2 1 300px">
                {item.status}
              </Text>
              <Badge variant="light" color="indigo">
                {item.trigger}
              </Badge>
              <ScreenLink to={item.to}>Open</ScreenLink>
            </Group>
          </Paper>
        ))}
      </Stack>
      {done.length ? (
        <Stack gap="sm" component="section" aria-label="Done">
          <SectionLabel>Done today</SectionLabel>
          {done.map((item) => (
            <Paper key={item.id} withBorder p="sm" radius="md">
              <Group gap="sm">
                <Text size="sm" fw={500}>
                  {item.title}
                </Text>
                <Text size="sm" c="dimmed">
                  {results[item.id] ?? 'Answered from the board.'}
                </Text>
              </Group>
            </Paper>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}
