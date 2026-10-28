import { useState } from 'react';
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Grid,
  Group,
  Paper,
  Stack,
  Text,
  Title,
  UnstyledButton,
  type MantineColor,
} from '@mantine/core';
import { usePoc } from '../store';
import { DiffBlock, Facts, LaterGate, PageHeader, SessionBadge, type ExecutionView } from '../ui';

// Review gate states as the backend records them; the reason says why a
// pending gate waits.
type ReviewState = 'passed' | 'pending' | 'failed' | 'stale';
type Severity = 'Critical' | 'High' | 'Medium' | 'Low';

interface Review {
  id: string;
  title: string;
  change: string;
  kind: string;
  state: ReviewState;
  session: ExecutionView;
  sessionLabel: string;
  reviewer: string;
  pass: string;
  scope?: string;
  facts: { label: string; value: string }[];
  diffs: { file: string; diff: string }[];
  findings: { severity: Severity; text: string; where: string; outcome: string }[];
  pendingReason?: string;
  verdict: string;
}

const STATES: Record<ReviewState, { label: string; color: MantineColor }> = {
  passed: { label: 'Passed', color: 'teal' },
  pending: { label: 'Pending · no reviewer slot', color: 'orange' },
  failed: { label: 'Failed · rejected', color: 'red' },
  stale: { label: 'Stale', color: 'orange' },
};

const SEVERITY: Record<Severity, MantineColor> = {
  Critical: 'red',
  High: 'red',
  Medium: 'orange',
  Low: 'gray',
};

const REVIEWS: Review[] = [
  {
    id: 'pools',
    title: 'Account pool scheduler',
    change: 'add-account-pool-scheduler',
    kind: 'Conflict resolution review',
    state: 'passed',
    session: { phase: 'ended', outcome: 'exited-0', reachability: 'reachable' },
    sessionLabel: 'Reviewer session stopped',
    reviewer: 'Claude Code · Fable 5.1',
    pass: 'Pass 1 of 3',
    scope: 'only the resolved conflicts (7e2d1b0 + origin/dev → a41c9e2)',
    facts: [
      { label: 'Implementer', value: 'Claude Code · mac-01' },
      { label: 'Reviewer', value: 'Claude Code · claude-fable-5-1 · read-only' },
      { label: 'Head', value: 'a41c9e2 (code-head identity, G3 item 17)' },
      { label: 'Evidence', value: 'sha256:9c1e…4ab0' },
    ],
    diffs: [
      {
        file: 'docs/architecture.md',
        diff: '@@ -212,9 +212,10 @@\n ### Branch protection\n `main` requires a PR and the verify check.\n+\n ### Harness account pools\n Each harness draws from a pool of subscriptions.',
      },
      {
        file: 'openspec/specs/harness-account-pools/spec.md',
        diff: '@@ -18,7 +18,5 @@\n-### Requirement: Account selection\n ### Requirement: Least-loaded account selection\n #### Scenario: All accounts busy',
      },
    ],
    findings: [
      {
        severity: 'Low',
        text: 'Two blank lines remain between the merged sections.',
        where: 'docs/architecture.md:217',
        outcome: 'Fixed by the implementer · no new pass',
      },
    ],
    verdict: 'Passed with 1 Low finding. Verify re-ran on a41c9e2, then auto-merge merged PR #61.',
  },
  {
    id: 'compose',
    title: 'Container Compose baseline',
    change: 'container-compose-baseline',
    kind: 'Implementation review',
    state: 'pending',
    session: { phase: 'none', reachability: 'reachable' },
    sessionLabel: 'No reviewer session · waiting for a slot',
    reviewer: 'Claude Code · Fable 5.1 (slots busy)',
    pass: 'Pass 1 of 3',
    pendingReason:
      'All Claude Code reviewer slots are busy (2 of 2). The gate never falls back to the implementer; if this reviewer becomes unavailable, the next authorized reviewer in the rotation takes over and the pass count carries over. Try 2 of 3 to get a reviewer failed; the last attempt is in 4 min. If it fails too, the task escalates to you as “Needs you”.',
    facts: [
      { label: 'Implementer', value: 'Claude Code · linux-01' },
      { label: 'Reviewer', value: 'Claude Code · claude-fable-5-1 · queued' },
      { label: 'Tries', value: '2 of 3 · then it needs you' },
      { label: 'Waiting', value: '1 h 12 min' },
    ],
    diffs: [],
    findings: [],
    verdict: 'No verdict yet. The task stays in Review; nothing downstream is admitted.',
  },
  {
    id: 'openapi',
    title: 'OpenAPI contracts for the control plane',
    change: '003-openapi-contracts',
    kind: 'Spec review',
    state: 'failed',
    session: { phase: 'ended', outcome: 'exited-0', reachability: 'reachable' },
    sessionLabel: 'Reviewer session stopped',
    reviewer: 'Codex',
    pass: 'Pass 1 of 3',
    scope: 'spec and plan (SpecKit)',
    facts: [
      { label: 'Implementer', value: 'Claude Code · linux-01' },
      { label: 'Reviewer', value: 'Codex · read-only' },
      { label: 'Artifact', value: 'specs/003-openapi-contracts/spec.md' },
      { label: 'Evidence', value: 'sha256:51d2…e07c' },
    ],
    diffs: [],
    findings: [
      {
        severity: 'High',
        text: 'A retried turn creates a new turn instead of reusing its client turn key, so one message can run twice.',
        where: 'specs/003-openapi-contracts/spec.md · POST /sessions/{id}/turns',
        outcome: 'Open · sent back to the implementer',
      },
      {
        severity: 'Medium',
        text: 'SSE cursor format is not specified for catch-up after reconnect.',
        where: 'specs/003-openapi-contracts/spec.md · GET /events',
        outcome: 'Open',
      },
    ],
    verdict:
      'Changes requested. The implementer fixes the findings automatically; pass 2 of 3 starts on the new revision.',
  },
  {
    id: 'protect',
    title: 'Shared kernel',
    change: 'add-shared-kernel',
    kind: 'Implementation review',
    state: 'passed',
    session: { phase: 'ended', outcome: 'exited-0', reachability: 'reachable' },
    sessionLabel: 'Reviewer session stopped',
    reviewer: 'Codex',
    pass: 'Pass 2 of 3',
    scope: 'full change',
    facts: [
      { label: 'Implementer', value: 'Claude Code · mac-01' },
      { label: 'Reviewer', value: 'Codex · read-only' },
      { label: 'Head', value: '45998fb' },
      { label: 'Evidence', value: 'sha256:0f3a…71c9' },
    ],
    diffs: [],
    findings: [
      {
        severity: 'Medium',
        text: 'Required check name did not match the CI job.',
        where: 'docs/releases.md',
        outcome: 'Fixed in pass 2',
      },
    ],
    verdict: 'Passed in pass 2. Merged PR #46; the change is archived.',
  },
];

function QueueItem({ review, selected, onPick }: { review: Review; selected: boolean; onPick: () => void }) {
  const st = STATES[review.state];
  return (
    <UnstyledButton onClick={onPick} aria-pressed={selected}>
      <Paper
        withBorder
        p="sm"
        radius="md"
        bd={selected ? '2px solid var(--mantine-primary-color-filled)' : undefined}
      >
        <Stack gap={6}>
          <Group justify="space-between" wrap="nowrap" align="flex-start">
            <Text fw={600} size="sm">
              {review.title}
            </Text>
            <Badge size="sm" variant="light" color={st.color}>
              {st.label}
            </Badge>
          </Group>
          <Text size="xs" ff="monospace" c="dimmed">
            {review.change}
          </Text>
          <Text size="xs" c="dimmed">
            {review.kind} · {review.reviewer} · {review.pass}
            {review.reviewer.startsWith('Codex') ? ' · Codex reviews in G4' : ''}
          </Text>
          <SessionBadge view={review.session} label={review.sessionLabel} />
        </Stack>
      </Paper>
    </UnstyledButton>
  );
}

function ReviewDetail({ review }: { review: Review }) {
  const { go } = usePoc();
  const st = STATES[review.state];
  return (
    <Paper withBorder p="lg" radius="md" component="section" aria-label="Review detail">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Stack gap={4}>
            <Text size="xs" tt="uppercase" fw={600} c="dimmed">
              {review.kind}
            </Text>
            <Title order={2} size="h3">
              {review.title}
            </Title>
            <Text size="sm" ff="monospace" c="dimmed">
              {review.change}
            </Text>
          </Stack>
          <Badge size="lg" variant="light" color={st.color}>
            {st.label}
          </Badge>
        </Group>
        <SessionBadge view={review.session} label={review.sessionLabel} harness={review.reviewer} />
        <Facts items={review.facts} />
        {review.pendingReason ? (
          <Alert color="orange" variant="light" title="Gate stays pending">
            {review.pendingReason}
          </Alert>
        ) : null}
        {review.diffs.length ? (
          <Stack gap="xs">
            <Title order={3} size="h6">
              Under review: {review.scope}
            </Title>
            {review.diffs.map((d) => (
              <DiffBlock key={d.file} file={d.file} diff={d.diff} />
            ))}
          </Stack>
        ) : null}
        {review.findings.length ? (
          <Stack gap="xs">
            <Title order={3} size="h6">
              Findings
            </Title>
            {review.findings.map((finding) => (
              <Paper key={finding.text} withBorder p="sm" radius="md">
                <Group align="flex-start" wrap="nowrap" gap="sm">
                  <Badge color={SEVERITY[finding.severity]} variant="light">
                    {finding.severity}
                  </Badge>
                  <Stack gap={2} flex={1}>
                    <Text size="sm">{finding.text}</Text>
                    <Text size="xs" ff="monospace" c="dimmed">
                      {finding.where}
                    </Text>
                  </Stack>
                  <Text size="xs" c="dimmed" maw={200}>
                    {finding.outcome}
                  </Text>
                </Group>
              </Paper>
            ))}
          </Stack>
        ) : null}
        <Group justify="space-between" gap="sm">
          <Text size="sm" fw={500}>
            {review.verdict}
          </Text>
          <Group gap="sm">
            <Anchor href="#" size="sm" onClick={(event) => event.preventDefault()}>
              View evidence
            </Anchor>
            <Button size="xs" variant="light" onClick={() => go('session')}>
              Open session
            </Button>
          </Group>
        </Group>
      </Stack>
    </Paper>
  );
}

export function ReviewsScreen() {
  const [selectedId, setSelectedId] = useState('pools');
  const selected = REVIEWS.find((review) => review.id === selectedId)!;
  return (
    <Stack gap="md">
      <PageHeader
        title="Reviews"
        description="Independent review gates. Reviewers are read-only and never the identity that implemented the change."
        aside={
          <Group gap="xs">
            <Badge variant="default">Assigned reviewer per pass</Badge>
            <Badge variant="default">At most 3 passes</Badge>
            <Badge variant="default">Low-only: fixed without another pass</Badge>
            <Badge variant="default">After pass 3 the owner decides open Critical, High, Medium</Badge>
            <LaterGate>review runtime · G3 item 21</LaterGate>
          </Group>
        }
      />
      <Grid gap="md">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Stack gap="sm" component="section" aria-label="Review queue">
            {REVIEWS.map((review) => (
              <QueueItem
                key={review.id}
                review={review}
                selected={review.id === selectedId}
                onPick={() => setSelectedId(review.id)}
              />
            ))}
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <ReviewDetail review={selected} />
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
