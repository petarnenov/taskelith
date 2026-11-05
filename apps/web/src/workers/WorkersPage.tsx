import { Alert, Anchor, Button, Card, Group, List, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useId } from 'react';
import type { ReadFailed, ReadFailure } from '../api/read-result';
import { formatInstant } from '../board/board-labels';
import { Breakable } from '../board/Breakable';
import { LoadError, withRequiredRole } from '../board/LoadError';
import { WORKERS } from '../screens';
import { useSession } from '../session/SessionProvider';
import { LoadingStatus } from '../shell/LoadingStatus';
import { EnrollmentTokens, TOKENS_SECTION_ID } from './EnrollmentTokens';
import { INSTALLATION_OWNER, type SelfCheckResult, type WorkerAdmissionEntry, type WorkersView } from './workers';
import { ADMISSION_LABELS, failedFirst, OUTCOME_LABELS, PLATFORM_LABELS, REASON_LABELS } from './workers-labels';
import { useWorkers } from './useWorkers';

// The theme's error color, which the contrast matrix keeps at 4.5:1 on
// the page and on a card in both schemes.
const ERROR_COLOR = 'var(--mantine-color-error)';

// The workers of the installation (product UI "Automatic worker
// admission"), one snapshot read again on Refresh, and the enrollment tokens.
export function WorkersPage() {
  const { view, signedInGeneration } = useSession();
  const owner = view.status === 'signed-in' && view.operator.installationRoles.includes(INSTALLATION_OWNER);
  return (
    <Stack>
      <Title order={1}>{WORKERS.title}</Title>
      {owner ? (
        <>
          <Workers />
          {/* Each sign-in mounts its own section; no reveal outlives it. */}
          <EnrollmentTokens key={signedInGeneration()} />
        </>
      ) : (
        <RoleNotice />
      )}
    </Stack>
  );
}

// Decision Q2 (a): without the role, the page reads nothing; the control
// plane's 403 still covers a role that changed after the sign-in.
function RoleNotice() {
  return (
    <Alert color="gray" variant="light" title={`Needs ${INSTALLATION_OWNER}`} role="status">
      Listing the workers needs the role {INSTALLATION_OWNER}, which your session does not hold, so nothing was read.
    </Alert>
  );
}

function Workers() {
  const { state, refresh } = useWorkers();
  if (state.status === 'loading') return <LoadingStatus text="Loading the workers…" />;
  if (state.status === 'failed') return <WorkersFailure failure={state.failure} onRetry={refresh} />;
  return <ShownWorkers view={state.view} refreshing={state.refreshing} onRefresh={refresh} />;
}

interface ShownWorkersProps {
  readonly view: WorkersView;
  readonly refreshing: boolean;
  readonly onRefresh: () => void;
}

function ShownWorkers({ view, refreshing, onRefresh }: ShownWorkersProps) {
  return (
    <Stack>
      <Group>
        <Text>
          As of <time dateTime={view.asOf}>{formatInstant(view.asOf)}</time>
        </Text>
        <Button variant="default" onClick={onRefresh}>
          Refresh
        </Button>
        {refreshing ? <LoadingStatus text="Refreshing the workers…" /> : null}
      </Group>
      {view.workers.length === 0 ? (
        <Text c="dimmed">
          No worker is enrolled. Enroll one with an <Anchor href={`#${TOKENS_SECTION_ID}`}>enrollment token</Anchor>.
        </Text>
      ) : (
        <SimpleGrid component="section" aria-label="Workers" cols={{ base: 1, sm: 2, xl: 4 }}>
          {view.workers.map((worker) => (
            <WorkerCard key={worker.workerId} worker={worker} />
          ))}
        </SimpleGrid>
      )}
    </Stack>
  );
}

function WorkerCard({ worker }: { readonly worker: WorkerAdmissionEntry }) {
  const headingId = useId();
  const { host, admission } = worker;
  const failed = admission === 'self-check-failed';
  return (
    <Card component="article" withBorder aria-labelledby={headingId}>
      <Stack gap="xs">
        <Title order={2} id={headingId} size="h3">
          <Breakable text={host.hostname} />
        </Title>
        <Text c="dimmed">
          Worker{' '}
          <Text span ff="monospace" inherit>
            <Breakable text={worker.workerId} />
          </Text>
        </Text>
        <Text>
          {PLATFORM_LABELS[host.platform]} {host.architecture}, enrolled{' '}
          <time dateTime={worker.enrolledAt}>{formatInstant(worker.enrolledAt)}</time>
        </Text>
        <Text c={failed ? ERROR_COLOR : undefined} fw={failed ? 700 : undefined}>
          {ADMISSION_LABELS[admission]}
        </Text>
        <LastReport reportedAt={worker.reportedAt} />
        {worker.results.length === 0 ? null : <SelfChecks results={worker.results} />}
      </Stack>
    </Card>
  );
}

function LastReport({ reportedAt }: { readonly reportedAt: string | undefined }) {
  if (reportedAt === undefined) return <Text c="dimmed">No report yet.</Text>;
  return (
    <Text c="dimmed">
      Last report <time dateTime={reportedAt}>{formatInstant(reportedAt)}</time>
    </Text>
  );
}

// Decision Q3 (a): every check in words, the failed ones first with their
// problems as text; the details are shown as received, never parsed.
function SelfChecks({ results }: { readonly results: readonly SelfCheckResult[] }) {
  return (
    <List aria-label="Self-checks">
      {failedFirst(results).map((result) => (
        <List.Item key={result.checkId}>
          <SelfCheck result={result} />
        </List.Item>
      ))}
    </List>
  );
}

// A div, not a paragraph, since the problems of a failed check are a list.
function SelfCheck({ result }: { readonly result: SelfCheckResult }) {
  const failed = result.outcome === 'failed';
  return (
    <Text component="div" c={failed ? ERROR_COLOR : 'dimmed'}>
      <Text span ff="monospace" inherit>
        <Breakable text={result.checkId} />
      </Text>{' '}
      {OUTCOME_LABELS[result.outcome]}
      {result.outcome === 'not-applicable' ? `: ${REASON_LABELS[result.details[0]!]}` : null}
      {failed ? (
        <List withPadding>
          {result.details.map((problem, index) => (
            <List.Item key={index}>
              <Breakable text={problem} />
            </List.Item>
          ))}
        </List>
      ) : null}
    </Text>
  );
}

const FAILURES: Readonly<Record<ReadFailure, { readonly title: string; readonly text: string }>> = {
  unauthenticated: {
    title: 'Your session ended',
    text: 'The control plane answered this read as one without a session, which may have ended before a newer one began. Retry reads the workers again.',
  },
  unavailable: {
    title: 'The workers cannot be loaded',
    text: 'The control plane did not answer with the workers, so no worker is shown rather than a list that may be wrong.',
  },
  denied: {
    title: 'No access to the workers',
    text: 'Your session holds no role that lets you list the workers.',
  },
  'not-found': {
    title: 'The workers cannot be loaded',
    text: 'The control plane knows no workers view at this address.',
  },
};

function WorkersFailure({ failure, onRetry }: { readonly failure: ReadFailed; readonly onRetry: () => void }) {
  const { title, text } = FAILURES[failure.kind];
  return (
    <LoadError title={title} onRetry={onRetry}>
      {withRequiredRole(text, failure)}
    </LoadError>
  );
}
