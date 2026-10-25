import { useState } from 'react';
import { Alert, Badge, Button, Code, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { usePoc, type InboxDecision, type InboxId, type Screen } from '../store';
import { PageHeader, ScreenLink, SectionLabel, SessionBadge, type SessionState } from '../ui';
import { CheckIcon } from '../icons';

interface Action {
  label: string;
  primary?: boolean;
  decision: InboxDecision;
  result: string;
}

const NOW: {
  id: InboxId;
  kind: string;
  title: string;
  age: string;
  session: SessionState;
  sessionLabel: string;
  harness: string;
  why: string;
  code?: string;
  actions: Action[];
}[] = [
  {
    id: 'kernel-approval',
    kind: 'Native approval',
    title: 'Task admission · Claude Code on mac-01',
    age: '6 min',
    session: 'approval',
    sessionLabel: 'Waiting for you',
    harness: 'Claude Code · mac-01',
    why: 'The harness asks to run a command that the project policy does not pre-authorize.',
    code: 'nvm use && make verify',
    actions: [
      {
        label: 'Approve once',
        primary: true,
        decision: 'approved',
        result: 'Approved once. The attempt continues.',
      },
      {
        label: 'Always allow in this project',
        decision: 'approved',
        result:
          'Added to the project policy as a standing rule with your name, its scope (this command in this project) and policy v3 r13. Future runs will not ask; every use is audited.',
      },
      { label: 'Deny', decision: 'denied', result: 'Denied. The harness waits for your instructions.' },
    ],
  },
  {
    id: 'codex-spec',
    kind: 'Spec approval',
    title: 'Qualify Codex on Linux',
    age: '22 min',
    session: 'idle',
    sessionLabel: 'Session idle',
    harness: 'Codex · linux-02',
    why: 'You chose to approve this spec yourself. The proposal and 3 requirements are ready; the reviewer found no issues.',
    actions: [
      {
        label: 'Approve spec',
        primary: true,
        decision: 'approved',
        result: 'Spec approved. Implementation is admitted.',
      },
      { label: 'Request changes', decision: 'changes', result: 'Sent back to Specify with your note.' },
    ],
  },
];

const SOON: {
  title: string;
  session: SessionState;
  sessionLabel: string;
  harness: string;
  status: string;
  trigger: string;
  to: Screen;
}[] = [
  {
    title: 'Container Compose baseline',
    session: 'idle',
    sessionLabel: 'Session idle',
    harness: 'Claude Code · linux-01',
    status: 'No reviewer: Claude Code reviewer slots full. Attempt 2 of 3 failed, last attempt in 4 min.',
    trigger: 'Escalates after attempt 3',
    to: 'reviews',
  },
  {
    title: 'Lint tooling',
    session: 'live',
    sessionLabel: 'Session live',
    harness: 'Codex · linux-02',
    status: 'Typecheck failed on attempt 2 of 3. Codex is fixing it.',
    trigger: 'Escalates after attempt 3',
    to: 'session',
  },
  {
    title: 'Evidence store adapter · linux-03',
    session: 'uncertain',
    sessionLabel: 'Ownership uncertain',
    harness: 'Claude Code · linux-03',
    status:
      'Lost contact 6 min ago. Not reassigned; its capacity stays reserved until ownership is reconciled.',
    trigger: 'Escalates after 15 min',
    to: 'workers',
  },
];

export function InboxScreen() {
  const { decisions, decide, needsYouCount } = usePoc();
  const [results, setResults] = useState<Partial<Record<InboxId, string>>>({});
  const open = NOW.filter((item) => !decisions[item.id]);
  const done = NOW.filter((item) => decisions[item.id]);
  const act = (id: InboxId, action: Action) => {
    setResults({ ...results, [id]: action.result });
    decide(id, action.decision);
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
        {open.map((item) => (
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
                <Title order={3} size="h5" flex={1}>
                  {item.title}
                </Title>
                <Text size="xs" c="dimmed">
                  {item.age}
                </Text>
              </Group>
              <SessionBadge state={item.session} label={item.sessionLabel} harness={item.harness} />
              <Text size="sm">{item.why}</Text>
              {item.code ? <Code block>{item.code}</Code> : null}
              <Group gap="xs">
                {item.actions.map((action) => (
                  <Button
                    key={action.label}
                    variant={action.primary ? 'filled' : 'default'}
                    onClick={() => act(item.id, action)}
                  >
                    {action.label}
                  </Button>
                ))}
                <Group ml="auto">
                  <ScreenLink to="board">Open task</ScreenLink>
                </Group>
              </Group>
            </Stack>
          </Paper>
        ))}
      </Stack>
      <Stack gap="sm" component="section" aria-label="Might need you soon">
        <SectionLabel>Taskelith is handling · might need you</SectionLabel>
        {SOON.map((item) => (
          <Paper key={item.title} withBorder p="sm" radius="md">
            <Group gap="md" wrap="wrap">
              <Text fw={600} size="sm" miw={200} flex="1 1 200px">
                {item.title}
              </Text>
              <SessionBadge state={item.session} label={item.sessionLabel} harness={item.harness} />
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
                  {results[item.id] ?? 'Resolved from the board.'}
                </Text>
              </Group>
            </Paper>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}
