import { useEffect, useState } from 'react';
import {
  Avatar,
  Badge,
  Breadcrumbs,
  Code,
  Grid,
  Group,
  Loader,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  Timeline,
  Title,
  type MantineColor,
} from '@mantine/core';
import {
  DiffBlock,
  LaterGate,
  PageHeader,
  RoleButton,
  ScreenLink,
  SessionBadge,
  type ExecutionView,
} from '../ui';
import { LiveStatus } from './LiveStatus';

type Entry =
  | { kind: 'system' | 'agent'; text: string }
  | { kind: 'user'; text: string; turnKey: string; confirmed: boolean }
  | { kind: 'tool'; command: string; output: string }
  | { kind: 'edit'; file: string; diff: string };

type GateRun = 'old' | 'stale' | 'running' | 'passed';

interface Step {
  entries: Entry[];
  resolved: number;
  verify: GateRun;
  review?: GateRun;
  done?: boolean;
}

const SCRIPT: Step[] = [
  {
    entries: [
      {
        kind: 'system',
        text: 'Auto-merge of PR #61 into dev failed: 2 files conflict. Resolve the conflicts on add-account-pool-scheduler, keep the intent of both sides, then push. Verify and an independent review of the resolution re-run on the new head.',
      },
    ],
    resolved: 0,
    verify: 'old',
  },
  {
    entries: [
      {
        kind: 'tool',
        command: 'git fetch origin && git merge origin/dev',
        output:
          'Auto-merging docs/architecture.md\nCONFLICT (content): Merge conflict in docs/architecture.md\nAuto-merging openspec/specs/harness-account-pools/spec.md\nCONFLICT (content): Merge conflict in openspec/specs/harness-account-pools/spec.md\nAutomatic merge failed; fix conflicts and then commit the result.',
      },
    ],
    resolved: 0,
    verify: 'old',
  },
  {
    entries: [
      {
        kind: 'agent',
        text: 'dev added a branch-protection section to docs/architecture.md in the same place where this branch added the account-pool section. Both stay, in document order.',
      },
    ],
    resolved: 0,
    verify: 'old',
  },
  {
    entries: [
      {
        kind: 'edit',
        file: 'docs/architecture.md',
        diff: '@@ -212,9 +212,10 @@\n ### Branch protection\n `main` requires a PR and the verify check.\n-<<<<<<< HEAD\n-=======\n+\n ### Harness account pools\n Each harness draws from a pool of subscriptions.\n->>>>>>> add-account-pool-scheduler',
      },
      { kind: 'tool', command: 'git add docs/architecture.md', output: '' },
    ],
    resolved: 1,
    verify: 'old',
  },
  {
    entries: [
      {
        kind: 'agent',
        text: 'In the spec, dev renamed the requirement "Account selection" to "Least-loaded account selection". I keep the new name and move this branch’s scenarios under it.',
      },
    ],
    resolved: 1,
    verify: 'old',
  },
  {
    entries: [
      {
        kind: 'edit',
        file: 'openspec/specs/harness-account-pools/spec.md',
        diff: '@@ -18,7 +18,5 @@\n-<<<<<<< HEAD\n-### Requirement: Account selection\n-=======\n ### Requirement: Least-loaded account selection\n->>>>>>> origin/dev\n #### Scenario: All accounts busy',
      },
      {
        kind: 'tool',
        command: 'npm run openspec -- validate add-account-pool-scheduler',
        output: "✓ Change 'add-account-pool-scheduler' is valid",
      },
    ],
    resolved: 2,
    verify: 'old',
  },
  {
    entries: [
      {
        kind: 'tool',
        command: 'git commit --no-edit',
        output: '[add-account-pool-scheduler a41c9e2] Merge origin/dev into add-account-pool-scheduler',
      },
    ],
    resolved: 2,
    verify: 'old',
  },
  {
    entries: [
      {
        kind: 'system',
        text: 'Push to the task branch is pre-authorized by project policy while auto-merge is on. No human approval needed.',
      },
      {
        kind: 'tool',
        command: 'git push origin add-account-pool-scheduler',
        output: '   7e2d1b0..a41c9e2  add-account-pool-scheduler -> add-account-pool-scheduler',
      },
    ],
    resolved: 2,
    review: 'stale',
    verify: 'stale',
  },
  {
    entries: [
      {
        kind: 'system',
        text: 'New head a41c9e2. Verify and review are stale for the old head. Verify runs first on the new head.',
      },
    ],
    resolved: 2,
    review: 'stale',
    verify: 'running',
  },
  {
    entries: [
      {
        kind: 'system',
        text: 'Platform verify on a41c9e2 (not an agent step): make verify and CI passed: typecheck, dependency boundaries, openspec validate, 42 tests, coverage 81% lines · 77% branches · 84% functions.',
      },
    ],
    resolved: 2,
    review: 'stale',
    verify: 'passed',
  },
  {
    entries: [
      {
        kind: 'system',
        text: 'Verify passed on a41c9e2. Claude Code (Fable 5.1) reviews the resolved diff (pass 1 of 3).',
      },
    ],
    resolved: 2,
    review: 'running',
    verify: 'passed',
  },
  {
    entries: [
      {
        kind: 'system',
        text: 'Review passed: the resolution keeps the intent of both sides. 1 Low finding, fixed without another pass. Accept and integrate: merging PR #61 into dev. The change is archived and this session has stopped (confirmed by mac-01).',
      },
    ],
    resolved: 2,
    review: 'passed',
    verify: 'passed',
    done: true,
  },
];

const FILES = ['docs/architecture.md', 'openspec/specs/harness-account-pools/spec.md'];
const TICK = 2600;
const STOP_DELAY = 2500;
const TURN_CONFIRM_DELAY = 700;

const GATE_RUN: Record<GateRun, { label: string; color: MantineColor }> = {
  old: { label: 'Passed (old head)', color: 'teal' },
  stale: { label: 'Stale', color: 'orange' },
  running: { label: 'Running', color: 'indigo' },
  passed: { label: 'Passed', color: 'teal' },
};

function status(step: Step, stopping: boolean, stopped: boolean): { label: string; view: ExecutionView } {
  const running: ExecutionView = {
    phase: 'running',
    reachability: 'reachable',
    turn: 'working',
    ownershipGeneration: 2,
  };
  if (stopping) {
    return {
      label: 'Stopping · awaiting proof from mac-01',
      view: { ...running, cancellation: 'requested' },
    };
  }
  if (stopped) {
    return {
      label: 'Ended · killed after stop, confirmed by mac-01',
      view: { ...running, phase: 'ended', outcome: 'exited-signal', cancelled: true },
    };
  }
  if (step.done)
    return { label: 'Ended · exit 0 · merged', view: { ...running, phase: 'ended', outcome: 'exited-0' } };
  return { label: 'Session live', view: running };
}

function gateRows(step: Step) {
  const verify = GATE_RUN[step.verify];
  const review = GATE_RUN[step.review ?? 'old'];
  const verifyNote = {
    old: 'Head 7e2d1b0 · goes stale after the push',
    stale: 'New head a41c9e2 · queued',
    running: 'make verify + CI on a41c9e2',
    passed: 'make verify + CI on a41c9e2',
  }[step.verify];
  const reviewNote = {
    old: 'Head 7e2d1b0 · Claude Code · Fable 5.1',
    stale: 'Waits for verify on a41c9e2',
    running: 'Resolved diff on a41c9e2 · Claude Code · Fable 5.1 · pass 1 of 3',
    passed: 'Resolved diff on a41c9e2 · Claude Code · Fable 5.1 · pass 1 of 3',
  }[step.review ?? 'old'];
  return [
    { name: 'Verify', ...verify, note: verifyNote },
    { name: 'Independent review', ...review, note: reviewNote },
    {
      name: 'Merge · accept and integrate',
      label: step.done ? 'Merged' : 'Blocked by conflicts',
      color: step.done ? 'teal' : 'orange',
      note: 'PR #61 → dev · merge commit',
    },
  ];
}

function EntryView({ entry }: { entry: Entry }) {
  switch (entry.kind) {
    case 'system':
      return (
        <Paper withBorder p="sm" radius="md">
          <Group gap="xs" align="flex-start" wrap="nowrap">
            <Badge variant="light" size="sm">
              Taskelith
            </Badge>
            <Text size="sm">{entry.text}</Text>
          </Group>
        </Paper>
      );
    case 'agent':
      return (
        <Group gap="sm" align="flex-start" wrap="nowrap">
          <Avatar color="orange" radius="xl" size="md" aria-hidden="true">
            CC
          </Avatar>
          <Stack gap={2}>
            <Text size="xs" fw={600}>
              Claude Code
            </Text>
            <Text size="sm">{entry.text}</Text>
          </Stack>
        </Group>
      );
    case 'user':
      return (
        <Stack gap={2} align="flex-end">
          <Paper p="sm" radius="md" bg="var(--mantine-primary-color-light)">
            <Text size="sm">{entry.text}</Text>
          </Paper>
          <Text size="xs" c="dimmed">
            {entry.confirmed ? 'PP · accepted, delivered at the next turn boundary' : 'PP · sending'} · turn
            key {entry.turnKey}
          </Text>
        </Stack>
      );
    case 'tool': {
      const lines = entry.output ? entry.output.split('\n').length : 0;
      return (
        <Group gap="sm" wrap="wrap">
          <Code>{entry.command}</Code>
          <Text size="xs" c="dimmed">
            {lines ? lines + ' lines in live output' : 'no output'}
          </Text>
        </Group>
      );
    }
    case 'edit':
      return (
        <Stack gap={6}>
          <Group gap="xs">
            <Badge variant="default" size="sm">
              Edited
            </Badge>
            <Code>{entry.file}</Code>
            <Text size="xs" c="teal">
              conflict resolved
            </Text>
          </Group>
          <DiffBlock diff={entry.diff} />
        </Stack>
      );
  }
}

function terminalLines(entries: Entry[]) {
  return entries.flatMap((entry) => {
    if (entry.kind !== 'tool') return [];
    const output = entry.output ? entry.output.split('\n') : [];
    return [
      { text: '$ ' + entry.command, color: 'indigo' },
      ...output.map((text) => ({
        text,
        color: text.startsWith('CONFLICT') || text.startsWith('Automatic merge failed') ? 'red' : undefined,
      })),
    ];
  });
}

export function SessionScreen() {
  const [step, setStep] = useState(0);
  const [stopping, setStopping] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Entry[]>([]);
  const current = SCRIPT[step];
  const working = !stopped && !stopping && step < SCRIPT.length - 1;

  useEffect(() => {
    if (!working) return undefined;
    const timer = window.setTimeout(() => setStep((s) => s + 1), TICK);
    return () => clearTimeout(timer);
  }, [working, step]);

  useEffect(() => {
    if (!stopping) return undefined;
    const timer = window.setTimeout(() => {
      setStopping(false);
      setStopped(true);
    }, STOP_DELAY);
    return () => clearTimeout(timer);
  }, [stopping]);

  const stop = () => setStopping(true);
  const send = () => {
    const text = draft.trim();
    if (!text) return;
    const turnKey = 'tk-' + Math.random().toString(16).slice(2, 8);
    setMessages((m) => [...m, { kind: 'user', text, turnKey, confirmed: false }]);
    setDraft('');
  };

  const unconfirmed = messages.some((e) => e.kind === 'user' && !e.confirmed);
  useEffect(() => {
    if (!unconfirmed) return undefined;
    const confirm = (e: Entry): Entry => (e.kind === 'user' ? { ...e, confirmed: true } : e);
    const timer = window.setTimeout(() => setMessages((m) => m.map(confirm)), TURN_CONFIRM_DELAY);
    return () => clearTimeout(timer);
  }, [unconfirmed]);

  const entries = [...SCRIPT.slice(0, step + 1).flatMap((s) => s.entries), ...messages];
  const terminal = terminalLines(entries);
  const st = status(current, stopping, stopped);
  const turns = [
    { n: 1, label: 'Implement', outcome: '34 min · 12 tool calls' },
    { n: 2, label: 'Implement', outcome: '18 min · 7 tool calls' },
    { n: 3, label: 'Verify', outcome: '3 min · 1 tool call' },
    { n: 4, label: 'Review fixes', outcome: '9 min · 4 tool calls' },
    { n: 5, label: 'Merge conflict resolution', outcome: st.label },
  ];

  return (
    <Stack gap="md">
      <PageHeader
        title="Resolving merge conflicts"
        crumbs={
          <Breadcrumbs>
            <ScreenLink to="board">Board</ScreenLink>
            <Text size="sm">Account pool scheduler</Text>
            <Text size="sm">Session</Text>
          </Breadcrumbs>
        }
        description={
          <Group gap="xs" component="span">
            <Code>add-account-pool-scheduler</Code>
            <Badge variant="default">PR #61 → dev</Badge>
            <Text span size="sm">
              Claude Code · mac-01
            </Text>
            <Badge variant="default">Turn 5</Badge>
            <Badge variant="default">Attempt #2 · ownership generation 2</Badge>
            <LaterGate>sessions and turns · G3 items 4, 13, 31</LaterGate>
          </Group>
        }
        aside={
          <Group gap="sm">
            <LiveStatus />
            <SessionBadge view={st.view} label={st.label} />
            {!stopped && !stopping && !current.done ? (
              <RoleButton capability="stop-or-retry" color="red" variant="light" onClick={stop}>
                Stop session
              </RoleButton>
            ) : null}
          </Group>
        }
      />
      <Grid gap="md">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Paper withBorder p="md" radius="md" component="section" aria-label="Conversation">
            <Stack gap="md">
              <Title order={2} size="h5">
                Conversation
              </Title>
              {entries.map((entry, i) => (
                <EntryView key={i} entry={entry} />
              ))}
              {working ? (
                <Group gap="xs">
                  <Loader size="xs" color="teal" />
                  <Text size="sm" c="dimmed">
                    Claude Code is working…
                  </Text>
                </Group>
              ) : null}
              <Group gap="xs" align="flex-end" wrap="nowrap">
                <TextInput
                  flex={1}
                  label="Message the agent"
                  placeholder="Message Claude Code…"
                  value={draft}
                  onChange={(event) => setDraft(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') send();
                  }}
                />
                <RoleButton capability="send-turn" onClick={send}>
                  Send
                </RoleButton>
              </Group>
            </Stack>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Stack gap="md" component="aside" aria-label="Session details">
            <Paper withBorder p="md" radius="md" component="section" aria-label="Conflict resolution">
              <Group justify="space-between" mb="xs">
                <Title order={2} size="h5">
                  Conflicts
                </Title>
                <Badge variant="light" color={current.resolved === 2 ? 'teal' : 'orange'}>
                  {current.resolved} of 2 resolved
                </Badge>
              </Group>
              <Stack gap={6}>
                {FILES.map((path, i) => (
                  <Group key={path} gap="xs" wrap="nowrap">
                    <Badge size="sm" variant="light" color={i < current.resolved ? 'teal' : 'orange'}>
                      {i < current.resolved ? 'resolved' : 'open'}
                    </Badge>
                    <Code>{path}</Code>
                  </Group>
                ))}
              </Stack>
            </Paper>
            <Paper withBorder p="md" radius="md" component="section" aria-label="Gates">
              <Title order={2} size="h5" mb="xs">
                Gates
              </Title>
              <Stack gap="sm">
                {gateRows(current).map((gate) => (
                  <Stack key={gate.name} gap={2}>
                    <Group justify="space-between">
                      <Text size="sm" fw={600}>
                        {gate.name}
                      </Text>
                      <Badge variant="light" color={gate.color}>
                        {gate.label}
                      </Badge>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {gate.note}
                    </Text>
                  </Stack>
                ))}
              </Stack>
            </Paper>
            <Paper withBorder p="md" radius="md" component="section" aria-label="Live output">
              <Group justify="space-between" mb="xs">
                <Title order={2} size="h5">
                  Live output
                </Title>
                <Text size="xs" c="dimmed">
                  {terminal.length} lines
                </Text>
              </Group>
              <ScrollArea.Autosize mah={260}>
                <Code block>
                  {terminal.map((line, i) => (
                    <Text key={i} span display="block" inherit c={line.color}>
                      {line.text}
                    </Text>
                  ))}
                </Code>
              </ScrollArea.Autosize>
            </Paper>
            <Paper withBorder p="md" radius="md" component="section" aria-label="Turn history">
              <Title order={2} size="h5" mb="sm">
                Turn history
              </Title>
              <Timeline active={3} bulletSize={12} lineWidth={2}>
                {turns.map((turn) => (
                  <Timeline.Item
                    key={turn.n}
                    title={
                      <Text size="sm" fw={600}>
                        #{turn.n} {turn.label}
                      </Text>
                    }
                  >
                    <Text size="xs" c="dimmed">
                      {turn.outcome}
                    </Text>
                  </Timeline.Item>
                ))}
              </Timeline>
            </Paper>
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
