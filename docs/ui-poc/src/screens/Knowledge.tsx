import { useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Grid,
  Group,
  Paper,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { Facts, LaterGate, PageHeader } from '../ui';

type LessonStatus = 'active' | 'retired';

interface Lesson {
  id: string;
  rev: number;
  status: LessonStatus;
  origin: string;
  text: string;
  provenance: [string, string][];
  uses: [string, string, number, string][];
  related: string[];
  helpful: number;
  notHelpful: number;
  retireReason?: string;
}

const LESSONS: Lesson[] = [
  {
    id: 'L-023',
    rev: 1,
    status: 'active',
    origin: 'from source feedback',
    text: 'Live-update bugs need a scenario for a suspended browser tab, not only for a network drop.',
    provenance: [
      ['Learned from', 'Board reconnect fix'],
      ['Evidence', 'PROJ-131 reopened in Jira after merge'],
      ['Recorded', 'rev 1'],
      ['Scope', 'Project taskelith only'],
    ],
    uses: [['Board drops live updates after reconnect', 'Specify', 1, 'Helpful']],
    related: ['SSE catch-up', 'Spec scenarios', 'Jira PROJ-131'],
    helpful: 1,
    notHelpful: 0,
  },
  {
    id: 'L-014',
    rev: 2,
    status: 'active',
    origin: 'from a failed verify',
    text: 'Run nvm use before make verify. The default shell Node fails the engines check and make verify stops early.',
    provenance: [
      ['Learned from', 'Shared kernel'],
      ['Evidence', 'Failed verify, attempt 1'],
      ['Recorded', 'rev 1 · then refined in rev 2'],
      ['Scope', 'Project taskelith only'],
    ],
    uses: [
      ['Task admission', 'Verify', 2, 'Helpful'],
      ['Worker journal format', 'Verify', 2, 'Helpful'],
      ['Lint tooling', 'Implement', 1, 'Not helpful'],
      ['Account pool scheduler', 'Verify', 2, 'Helpful'],
    ],
    related: ['make verify', 'Node 24.22.1', '.nvmrc', 'Verify stage'],
    helpful: 3,
    notHelpful: 1,
  },
  {
    id: 'L-021',
    rev: 1,
    status: 'active',
    origin: 'from a merge conflict',
    text: 'Conflicts in docs/architecture.md are usually two new sections in the same place. Keep both, in document order.',
    provenance: [
      ['Learned from', 'Account pool scheduler'],
      ['Evidence', 'Conflict resolution · review passed'],
      ['Recorded', 'rev 1'],
      ['Scope', 'Project taskelith only'],
    ],
    uses: [['Worker journal format', 'Accept and integrate', 1, 'Not used: spec conflict']],
    related: ['docs/architecture.md', 'Merge conflicts', 'Review of resolution'],
    helpful: 0,
    notHelpful: 0,
  },
  {
    id: 'L-009',
    rev: 1,
    status: 'active',
    origin: 'from a review finding',
    text: 'Never squash merge. Releases read conventional commits on main, and squash hides them.',
    provenance: [
      ['Learned from', 'SDLC workflow model'],
      ['Evidence', 'Review finding · Medium'],
      ['Recorded', 'rev 1'],
      ['Scope', 'Project taskelith only'],
    ],
    uses: [['Shared kernel', 'Review', 1, 'Helpful']],
    related: ['Merge method', 'Releases', 'Conventional commits'],
    helpful: 1,
    notHelpful: 0,
  },
  {
    id: 'L-017',
    rev: 1,
    status: 'retired',
    origin: 'from an agent observation',
    text: 'Skip review after a merge conflict resolution when only documentation files changed.',
    retireReason:
      'Retired automatically: it contradicts the project rule that every resolved conflict gets an independent review (owner decision, 2026-10-24). It is no longer handed to tasks; its provenance and the contradicting evidence are kept.',
    provenance: [
      ['Learned from', 'Container Compose baseline'],
      ['Evidence', 'Agent observation, not reviewed'],
      ['Recorded', 'rev 1'],
      ['Scope', 'Project taskelith only'],
    ],
    uses: [],
    related: ['Merge conflicts', 'Review of resolution', 'Contradicts project rule'],
    helpful: 0,
    notHelpful: 0,
  },
];

type Filter = 'all' | LessonStatus;

function StatusBadge({ status }: { status: LessonStatus }) {
  return status === 'retired' ? (
    <Badge size="sm" variant="light" color="gray">
      Retired
    </Badge>
  ) : (
    <Badge size="sm" variant="light" color="teal">
      Active
    </Badge>
  );
}

export function KnowledgeScreen() {
  const [selectedId, setSelectedId] = useState('L-023');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [overrides, setOverrides] = useState<Record<string, LessonStatus>>({});
  const statusOf = (lesson: Lesson) => overrides[lesson.id] ?? lesson.status;
  const count = (f: Filter) => LESSONS.filter((l) => f === 'all' || statusOf(l) === f).length;
  const visible = LESSONS.filter(
    (l) =>
      (filter === 'all' || statusOf(l) === filter) &&
      l.text.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const sel = LESSONS.find((l) => l.id === selectedId)!;
  const selStatus = statusOf(sel);
  const retireReason =
    overrides[sel.id] === 'retired'
      ? 'Retired by PP. It is no longer handed to tasks; its history stays.'
      : selStatus === 'retired'
        ? sel.retireReason
        : undefined;

  return (
    <Stack gap="md">
      <PageHeader
        title="Knowledge"
        description="Lessons learned from finished work, handed to later tasks. Advisory only: a lesson never changes a spec or passes a gate."
        aside={
          <Group gap="xs">
            <Badge variant="dot" color="teal">
              Learns from reviews, verify, merges and linked sources
            </Badge>
            <Badge variant="dot" color="teal">
              Graph projection lag 4 s
            </Badge>
            <Badge variant="dot" color="teal">
              Embeddings: [MODEL] · index current
            </Badge>
            <Badge variant="dot" color="gray">
              This project only
            </Badge>
            <LaterGate>Knowledge · G5 (D10)</LaterGate>
          </Group>
        }
      />
      <Grid gap="md">
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Stack gap="sm" component="section" aria-label="Lessons">
            <TextInput
              type="search"
              label="Search lessons"
              placeholder="Search lessons…"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
            <SegmentedControl
              aria-label="Filter lessons"
              value={filter}
              onChange={(v) => setFilter(v as Filter)}
              data={(['all', 'active', 'retired'] as Filter[]).map((f) => ({
                value: f,
                label: f[0].toUpperCase() + f.slice(1) + ' · ' + count(f),
              }))}
            />
            {visible.map((lesson) => (
              <UnstyledButton
                key={lesson.id}
                onClick={() => setSelectedId(lesson.id)}
                aria-pressed={lesson.id === selectedId}
              >
                <Paper
                  withBorder
                  p="sm"
                  radius="md"
                  bd={lesson.id === selectedId ? '2px solid var(--mantine-primary-color-filled)' : undefined}
                >
                  <Stack gap={6}>
                    <Text size="sm" fw={500}>
                      {lesson.text}
                    </Text>
                    <Group gap="xs">
                      <StatusBadge status={statusOf(lesson)} />
                      <Text size="xs" c="dimmed">
                        {lesson.origin} · used by {lesson.uses.length} tasks · {lesson.id} · rev {lesson.rev}
                      </Text>
                    </Group>
                  </Stack>
                </Paper>
              </UnstyledButton>
            ))}
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Paper withBorder p="lg" radius="md" component="section" aria-label="Lesson detail">
            <Stack gap="md">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap={4}>
                  <Text size="xs" c="dimmed" ff="monospace">
                    {sel.id} · revision {sel.rev}
                  </Text>
                  <Title order={2} size="h4">
                    {sel.text}
                  </Title>
                </Stack>
                <StatusBadge status={selStatus} />
              </Group>
              {retireReason ? (
                <Alert variant="light" color="gray">
                  {retireReason}
                </Alert>
              ) : null}
              <Stack gap="xs">
                <Title order={3} size="h6">
                  Provenance
                </Title>
                <Facts items={sel.provenance.map(([label, value]) => ({ label, value }))} />
              </Stack>
              <Stack gap="xs">
                <Title order={3} size="h6">
                  Handed to
                </Title>
                {sel.uses.length ? (
                  <Table fz="sm" withTableBorder>
                    <Table.Tbody>
                      {sel.uses.map(([task, stage, rev, outcome]) => (
                        <Table.Tr key={task}>
                          <Table.Td>{task}</Table.Td>
                          <Table.Td c="dimmed">
                            {stage} · rev {rev}
                          </Table.Td>
                          <Table.Td c={outcome === 'Helpful' ? 'teal' : 'dimmed'}>{outcome}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                ) : (
                  <Text size="sm" c="dimmed">
                    Not handed to any task yet.
                  </Text>
                )}
              </Stack>
              <Stack gap="xs">
                <Title order={3} size="h6">
                  Related
                </Title>
                <Group gap={6}>
                  {sel.related.map((r) => (
                    <Badge key={r} variant="default" tt="none">
                      {r}
                    </Badge>
                  ))}
                </Group>
              </Stack>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  Feedback from tasks: {sel.helpful} helpful · {sel.notHelpful} not helpful
                </Text>
                {selStatus === 'active' ? (
                  <Button
                    variant="light"
                    color="red"
                    onClick={() => setOverrides({ ...overrides, [sel.id]: 'retired' })}
                  >
                    Retire lesson
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    onClick={() => setOverrides({ ...overrides, [sel.id]: 'active' })}
                  >
                    Restore
                  </Button>
                )}
              </Group>
            </Stack>
          </Paper>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
