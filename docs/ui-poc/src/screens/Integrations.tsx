import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Grid,
  Group,
  List,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
  type MantineColor,
} from '@mantine/core';
import { Facts, PageHeader, ScreenLink } from '../ui';

type CheckState = 'verified' | 'partial' | 'linked' | 'pending';

const CHECK: Record<CheckState, { label: string; color: MantineColor }> = {
  verified: { label: 'Verified', color: 'teal' },
  partial: { label: 'Partial', color: 'orange' },
  linked: { label: 'Linked · not reviewed', color: 'orange' },
  pending: { label: 'Pending', color: 'gray' },
};

const CHECKLISTS: { title: string; items: [string, CheckState][] }[] = [
  {
    title: 'Qualification run g3 · macOS',
    items: [
      ['Token scope and narrowing', 'verified'],
      ['Denial outside the installation', 'verified'],
      ['Branches, commits and pull requests', 'verified'],
      ['Review by the App', 'partial'],
      ['Commit statuses', 'verified'],
      ['Merge blocking with admins enforced', 'verified'],
      ['Signed webhooks and redelivery', 'verified'],
      ['Cleanup', 'verified'],
    ],
  },
  {
    title: 'Before admission in G3',
    items: [
      ['Terms of service', 'linked'],
      ['Privacy statement', 'linked'],
      ['Webhook receiver on the raw body', 'pending'],
      ['Separate reviewer identity', 'pending'],
      ['Token refresh after 1 h', 'pending'],
      ['Private repos, permissions without administration', 'pending'],
      ['Cleanup after a failed run', 'pending'],
      ['Token narrowed to one repo of several', 'pending'],
      ['Rate limits under load', 'pending'],
      ['Recovery and upgrade (API retirement, outages)', 'pending'],
      ['Independent usage evidence, API version re-check', 'pending'],
      ['Security reporting and maintenance', 'pending'],
    ],
  },
];

const BINDING = [
  { label: 'Project', value: 'taskelith' },
  { label: 'SCM plugin', value: 'GitHub.com' },
  { label: 'Repository', value: '[OWNER]/taskelith' },
  { label: 'Work branch', value: 'dev (tasks merge here)' },
  { label: 'Protected', value: 'main: PR and verify check required' },
  { label: 'Merge method', value: 'Merge commit · squash disabled' },
  { label: 'Auto-merge', value: 'On · wins over manual integration' },
];

const EVENTS = [
  { text: 'PR #61 checks passed on a41c9e2', age: '2 min ago' },
  { text: 'Push to add-account-pool-scheduler (pre-authorized)', age: '4 min ago' },
  { text: 'PR #61 opened by Claude Code', age: '18 min ago' },
  { text: 'PR #46 merged into dev · change archived', age: 'yesterday' },
];

function useConnectionTest() {
  const [state, setState] = useState<'idle' | 'testing' | 'ok'>('idle');
  useEffect(() => {
    if (state !== 'testing') return undefined;
    const timer = window.setTimeout(() => setState('ok'), 1500);
    return () => clearTimeout(timer);
  }, [state]);
  return { state, run: () => setState('testing') };
}

function GitHubCard() {
  const test = useConnectionTest();
  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Group gap="xs">
              <Title order={2} size="h4">
                GitHub.com
              </Title>
              <Badge variant="default">First SCM</Badge>
            </Group>
            <Text size="sm" c="dimmed">
              Closed, hosted service · repositories live on GitHub, outside this installation
            </Text>
          </Stack>
          <Badge variant="light" color="orange">
            Candidate · qualification run recorded
          </Badge>
        </Group>
        <Facts
          items={[
            { label: 'Connection', value: 'GitHub App of this installation' },
            {
              label: 'Credentials',
              value: 'Per-run installation token, limited to the project’s repositories',
            },
            { label: 'Decision', value: 'ADR 0006 · supersedes ADR 0003 decision 3' },
            {
              label: 'Findings',
              value:
                'The App bypasses protection unless admins are enforced; it cannot approve its own PR; delivery IDs are strings',
            },
          ]}
        />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {CHECKLISTS.map((list) => (
            <Paper key={list.title} withBorder p="sm" radius="md">
              <Title order={3} size="h6" mb="xs">
                {list.title} · {list.items.filter(([, s]) => s === 'verified').length} of {list.items.length}
              </Title>
              <Stack gap={4}>
                {list.items.map(([label, state]) => (
                  <Group key={label} justify="space-between" gap="xs" wrap="nowrap">
                    <Text size="xs">{label}</Text>
                    <Text
                      size="xs"
                      fw={500}
                      c={CHECK[state].color === 'gray' ? 'dimmed' : CHECK[state].color}
                      miw="fit-content"
                    >
                      {CHECK[state].label}
                    </Text>
                  </Group>
                ))}
              </Stack>
            </Paper>
          ))}
        </SimpleGrid>
        {test.state === 'testing' ? (
          <Alert variant="light" color="indigo" title="Testing…">
            Requesting an installation token for this project only.
          </Alert>
        ) : null}
        {test.state === 'ok' ? (
          <Alert variant="light" color="teal" title="Connection works">
            Installation token issued for [OWNER]/taskelith only; it expires in 60 min and was not stored.
            Signed test webhook received.
          </Alert>
        ) : null}
        <Group justify="space-between" gap="sm">
          <Text size="xs" c="dimmed" maw={520}>
            Admitted in G3 only when every item before admission is done (ADR 0007). Until then it runs for
            qualification only. Evidence: docs/qualification/github.md.
          </Text>
          <Group gap="xs">
            <Button variant="default" loading={test.state === 'testing'} onClick={test.run}>
              Test connection
            </Button>
            <Button>Record evidence</Button>
          </Group>
        </Group>
      </Stack>
    </Card>
  );
}

function ForgejoCard() {
  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Group gap="xs">
              <Title order={2} size="h4">
                Forgejo
              </Title>
              <Badge variant="default">Second SCM</Badge>
            </Group>
            <Text size="sm" c="dimmed">
              Open source (GPL-3.0-or-later), self-hosted
            </Text>
          </Stack>
          <Badge variant="light" color="gray">
            Selected · not installed
          </Badge>
        </Group>
        <Facts
          items={[
            { label: 'When', value: 'After Taskelith works and the GitHub integration is proven' },
            { label: 'Evaluation', value: 'Candidate assessment in docs/integration-candidates.md' },
          ]}
        />
        <Group justify="space-between" gap="sm">
          <Text size="xs" c="dimmed" maw={520}>
            Until Forgejo is added, the SCM port is proven by one plugin plus the conformance suite.
          </Text>
          <Button disabled>Install plugin · later</Button>
        </Group>
      </Stack>
    </Card>
  );
}

export function IntegrationsScreen() {
  return (
    <Stack gap="md">
      <PageHeader
        title="SCM integrations"
        description="Source control plugins on the microkernel. No kernel code names a provider; each plugin is admitted only with recorded evidence."
      />
      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 8 }}>
          <Stack gap="md" component="section" aria-label="SCM plugins">
            <GitHubCard />
            <ForgejoCard />
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 4 }}>
          <Stack gap="md" component="aside" aria-label="Project bindings">
            <Paper withBorder p="md" radius="md">
              <Title order={2} size="h5" mb="sm">
                Project binding
              </Title>
              <Facts items={BINDING} />
              <Group mt="sm">
                <ScreenLink to="board">Merge settings on the board</ScreenLink>
              </Group>
            </Paper>
            <Paper withBorder p="md" radius="md">
              <Title order={2} size="h5" mb="sm">
                Recent SCM events
              </Title>
              <List spacing={6} size="sm">
                {EVENTS.map((event) => (
                  <List.Item key={event.text}>
                    {event.text}{' '}
                    <Text span size="xs" c="dimmed">
                      · {event.age}
                    </Text>
                  </List.Item>
                ))}
              </List>
              <Text size="xs" c="dimmed" mt="sm">
                Webhooks are accepted only with a valid signature.
              </Text>
            </Paper>
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
