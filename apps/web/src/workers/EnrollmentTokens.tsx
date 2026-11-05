import {
  Alert,
  Anchor,
  Button,
  Card,
  Group,
  List,
  Modal,
  NativeSelect,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
  type ButtonProps,
} from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { ReadFailed, ReadFailure } from '../api/read-result';
import { formatInstant } from '../board/board-labels';
import { Breakable } from '../board/Breakable';
import { LoadError, withRequiredRole } from '../board/LoadError';
import { LoadingStatus } from '../shell/LoadingStatus';
import {
  checkConstraints,
  EMPTY_FORM,
  retryable,
  RUNNING_TEXTS,
  statusTextOf,
  suggestsRefresh,
  TRUNCATED_TEXT,
  validityMinutesOf,
  type Command,
  type ConstraintsForm,
  type Notice,
} from './tokens-model';
import type { EnrollmentToken, EnrollmentTokenList, HostConstraints } from './workers';
import { PLATFORM_LABELS } from './workers-labels';
import { useEnrollmentTokens, type EnrollmentTokensState } from './useEnrollmentTokens';
import { useTokenCommands, type Reveal, type TokenCommands } from './useTokenCommands';

// The address of the section, which the workers' empty state links to.
export const TOKENS_SECTION_ID = 'enrollment-tokens';

const HOSTNAME_ERROR = 'A hostname is 1 to 1,024 characters without control characters.';

// The enrollment tokens of the installation: the pending ones as
// listEnrollmentTokens answers them, and the issue, revoke, rotate commands.
export function EnrollmentTokens() {
  const headingId = useId();
  const { state, refresh } = useEnrollmentTokens();
  const commands = useTokenCommands(refresh);
  const busy = commands.running !== undefined;
  const listed = state.status === 'shown' ? state.view.tokens.map((token) => token.tokenId) : [];
  return (
    <Stack component="section" id={TOKENS_SECTION_ID} aria-labelledby={headingId}>
      <Title order={2} id={headingId}>
        Enrollment tokens
      </Title>
      <IssueForm busy={busy} onIssue={(constraints) => commands.run({ name: 'issue', constraints })} />
      {commands.running === undefined ? null : <LoadingStatus text={RUNNING_TEXTS[commands.running.name]} />}
      <CommandNotice commands={commands} listed={listed} onRefresh={refresh} />
      <TokenList state={state} busy={busy} onRefresh={refresh} onCommand={commands.run} />
      {commands.reveal === undefined ? null : <RevealDialog reveal={commands.reveal} onClose={commands.closeReveal} />}
    </Stack>
  );
}

interface IssueFormProps {
  readonly busy: boolean;
  readonly onIssue: (constraints: HostConstraints) => void;
}

// Decision Q1 (a): the form opens in place, with the three optional
// constraints; an empty form sends no constraint, which accepts any host.
function IssueForm({ busy, onIssue }: IssueFormProps) {
  const [open, setOpen] = useState(false);
  return (
    <Stack align="flex-start">
      <Button variant="default" aria-expanded={open} onClick={() => setOpen((shown) => !shown)}>
        Enroll a worker
      </Button>
      {open ? <ConstraintsFields busy={busy} onIssue={onIssue} /> : null}
    </Stack>
  );
}

function ConstraintsFields({ busy, onIssue }: IssueFormProps) {
  const [form, setForm] = useState<ConstraintsForm>(EMPTY_FORM);
  const [hostnameError, setHostnameError] = useState<string>();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const check = checkConstraints(form);
    if (check.kind !== 'ok') {
      setHostnameError(HOSTNAME_ERROR);
      return;
    }
    setHostnameError(undefined);
    onIssue(check.constraints);
  };
  return (
    <Card component="form" withBorder aria-label="Enroll a worker" onSubmit={submit}>
      <Stack>
        <List type="ordered">
          <List.Item>Issue a token here, with the host constraints the worker must meet, if any.</List.Item>
          <List.Item>Start the worker with the secret in TASKELITH_ENROLLMENT_TOKEN; it enrolls, runs its self-check, and appears above.</List.Item>
        </List>
        <NativeSelect
          label="Platform"
          size="lg"
          value={form.platform}
          onChange={(event) => setForm({ ...form, platform: event.currentTarget.value as ConstraintsForm['platform'] })}
          data={[
            { value: '', label: 'Any' },
            { value: 'linux', label: PLATFORM_LABELS.linux },
            { value: 'darwin', label: PLATFORM_LABELS.darwin },
          ]}
        />
        <NativeSelect
          label="Architecture"
          size="lg"
          value={form.architecture}
          onChange={(event) => setForm({ ...form, architecture: event.currentTarget.value as ConstraintsForm['architecture'] })}
          data={[
            { value: '', label: 'Any' },
            { value: 'x64', label: 'x64' },
            { value: 'arm64', label: 'arm64' },
          ]}
        />
        <TextInput
          label="Hostname"
          description="Leave empty to accept any hostname."
          value={form.hostname}
          error={hostnameError}
          onChange={(event) => setForm({ ...form, hostname: event.currentTarget.value })}
        />
        <Group>
          <CommandButton type="submit" busy={busy}>
            Issue token
          </CommandButton>
        </Group>
      </Stack>
    </Card>
  );
}

interface CommandButtonProps extends ButtonProps {
  readonly busy: boolean;
  readonly type?: 'submit' | 'button';
  readonly onClick?: () => void;
}

// Decision Q11 (a): while a command runs every button says so and ignores
// clicks, but stays focusable, so focus is not lost when the answer comes.
function CommandButton({ busy, onClick, ...props }: CommandButtonProps) {
  const disabled = busy ? { 'aria-disabled': true, 'data-disabled': true } : {};
  return <Button {...props} {...disabled} onClick={busy ? undefined : onClick} />;
}

interface CommandNoticeProps {
  readonly commands: TokenCommands;
  readonly listed: readonly string[];
  readonly onRefresh: () => void;
}

// Decision Q7 (a): one status region above the list, which takes the focus
// once an answer came and the reveal, if any, closed.
function CommandNotice({ commands, listed, onRefresh }: CommandNoticeProps) {
  const { status, reveal, run } = commands;
  const notice = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (status !== undefined && reveal === undefined) notice.current?.focus();
  }, [status, reveal]);
  if (status === undefined) return null;
  const { title, text } = statusTextOf(status);
  return (
    <Alert ref={notice} tabIndex={-1} role="status" color={colorOf(status)} variant="light" title={title}>
      <Stack align="flex-start" gap="xs">
        <Text component="div">
          <Breakable text={withRole(text, status)} />
          {status.kind === 'token-rotated' && listed.includes(status.replacementTokenId) ? (
            <>
              {' '}
              <Anchor href={`#${anchorOf(status.replacementTokenId)}`} c="inherit" underline="always">
                Show it
              </Anchor>
            </>
          ) : null}
        </Text>
        {retryable(status) ? (
          <CommandButton busy={commands.running !== undefined} onClick={() => run(status.command)}>
            Retry
          </CommandButton>
        ) : null}
        {suggestsRefresh(status) ? (
          <Button variant="default" onClick={onRefresh}>
            Refresh the list
          </Button>
        ) : null}
      </Stack>
    </Alert>
  );
}

function withRole(text: string, status: Notice): string {
  return status.kind === 'denied' ? withRequiredRole(text, status) : text;
}

function colorOf(status: Notice): string {
  return status.kind === 'issued' || status.kind === 'revoked' ? 'indigo' : 'red';
}

function anchorOf(tokenId: string): string {
  return `enrollment-token-${encodeURIComponent(tokenId)}`;
}

interface TokenListProps {
  readonly state: EnrollmentTokensState;
  readonly busy: boolean;
  readonly onRefresh: () => void;
  readonly onCommand: (command: Command) => void;
}

function TokenList({ state, busy, onRefresh, onCommand }: TokenListProps) {
  if (state.status === 'loading') return <LoadingStatus text="Loading the enrollment tokens…" />;
  if (state.status === 'failed') return <TokensFailure failure={state.failure} onRetry={onRefresh} />;
  return <ShownTokens list={state.view} refreshing={state.refreshing} busy={busy} onRefresh={onRefresh} onCommand={onCommand} />;
}

interface ShownTokensProps {
  readonly list: EnrollmentTokenList;
  readonly refreshing: boolean;
  readonly busy: boolean;
  readonly onRefresh: () => void;
  readonly onCommand: (command: Command) => void;
}

type Confirmation = { readonly name: 'revoke' | 'rotate'; readonly tokenId: string };

// Decision Q6 (a): revoke and rotate ask once, in a dialog that returns
// the focus to the row's button when it closes.
function ShownTokens({ list, refreshing, busy, onRefresh, onCommand }: ShownTokensProps) {
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const confirm = (confirmed: Confirmation) => {
    onCommand(confirmed);
    setConfirmation(undefined);
  };
  return (
    <Stack>
      <Group>
        <Button variant="default" onClick={onRefresh}>
          Refresh tokens
        </Button>
        {refreshing ? <LoadingStatus text="Refreshing the tokens…" /> : null}
      </Group>
      {list.truncated ? (
        <Alert color="gray" variant="light" role="status">
          {TRUNCATED_TEXT}
        </Alert>
      ) : null}
      {list.tokens.length === 0 ? (
        <Text c="dimmed">No pending token.</Text>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, xl: 4 }}>
          {list.tokens.map((token) => (
            <TokenCard key={token.tokenId} token={token} busy={busy} onAsk={setConfirmation} />
          ))}
        </SimpleGrid>
      )}
      <ConfirmDialog confirmation={confirmation} onConfirm={confirm} onCancel={() => setConfirmation(undefined)} />
    </Stack>
  );
}

interface TokenCardProps {
  readonly token: EnrollmentToken;
  readonly busy: boolean;
  readonly onAsk: (confirmation: Confirmation) => void;
}

function TokenCard({ token, busy, onAsk }: TokenCardProps) {
  const headingId = useId();
  return (
    <Card component="article" withBorder id={anchorOf(token.tokenId)} aria-labelledby={headingId}>
      <Stack gap="xs">
        <Title order={3} id={headingId} size="h4" ff="monospace">
          <Breakable text={token.tokenId} />
        </Title>
        <TokenTimes token={token} />
        <Constraints constraints={token.constraints} />
        <Group>
          <CommandButton variant="default" busy={busy} onClick={() => onAsk({ name: 'rotate', tokenId: token.tokenId })}>
            Rotate
          </CommandButton>
          <CommandButton color="red" variant="light" busy={busy} onClick={() => onAsk({ name: 'revoke', tokenId: token.tokenId })}>
            Revoke
          </CommandButton>
        </Group>
      </Stack>
    </Card>
  );
}

// Decision Q10 (a): absolute times, no clock and no countdown.
function TokenTimes({ token }: { readonly token: EnrollmentToken }) {
  return (
    <Text c="dimmed">
      Issued <time dateTime={token.issuedAt}>{formatInstant(token.issuedAt)}</time>, expires{' '}
      <time dateTime={token.expiresAt}>{formatInstant(token.expiresAt)}</time>
    </Text>
  );
}

function Constraints({ constraints }: { readonly constraints: HostConstraints }) {
  const { platform, architecture, hostname } = constraints;
  return (
    <Text>
      {platform === undefined ? 'Any platform' : PLATFORM_LABELS[platform]}, {architecture ?? 'any architecture'},{' '}
      {hostname === undefined ? (
        'any hostname'
      ) : (
        <>
          hostname <Breakable text={hostname} />
        </>
      )}
    </Text>
  );
}

interface ConfirmDialogProps {
  readonly confirmation: Confirmation | undefined;
  readonly onConfirm: (confirmed: Confirmation) => void;
  readonly onCancel: () => void;
}

const CONFIRM_TITLES = { revoke: 'Revoke token', rotate: 'Rotate token' } as const;
const CONFIRM_LABELS = { revoke: 'Revoke', rotate: 'Rotate' } as const;

// The dialog stays mounted, so Mantine returns the focus when it closes;
// the last question is kept for the closing transition.
function ConfirmDialog({ confirmation, onConfirm, onCancel }: ConfirmDialogProps) {
  const [shown, setShown] = useState(confirmation);
  useEffect(() => {
    if (confirmation !== undefined) setShown(confirmation);
  }, [confirmation]);
  return (
    <Modal opened={confirmation !== undefined} onClose={onCancel} title={shown === undefined ? '' : CONFIRM_TITLES[shown.name]}>
      {shown === undefined ? null : (
        <Stack>
          <Text component="div">
            <ConfirmQuestion confirmation={shown} />
          </Text>
          <Group>
            <Button color={shown.name === 'revoke' ? 'red' : undefined} variant={shown.name === 'revoke' ? 'light' : 'filled'} onClick={() => onConfirm(shown)}>
              {CONFIRM_LABELS[shown.name]}
            </Button>
            <Button variant="default" onClick={onCancel}>
              Cancel
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

function ConfirmQuestion({ confirmation }: { readonly confirmation: Confirmation }) {
  const id = <Breakable text={confirmation.tokenId} />;
  if (confirmation.name === 'revoke') return <>Revoke token {id}? A worker can no longer enroll with it. This cannot be undone.</>;
  return <>Rotate token {id}? The token stops working now, and a new one with the same constraints and a fresh expiry is shown once.</>;
}

interface RevealDialogProps {
  readonly reveal: Reveal;
  readonly onClose: () => void;
}

// Decisions Q2 (a), Q3 (a), Q4 (b), and Q5 (a): the secret is shown once,
// in this dialog alone, which asks before closing without a copy.
function RevealDialog({ reveal, onClose }: RevealDialogProps) {
  const { token, secret } = reveal.issued;
  const clipboard = useClipboard({ timeout: 2000 });
  const [copiedOnce, setCopiedOnce] = useState(false);
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (clipboard.copied) setCopiedOnce(true);
  }, [clipboard.copied]);
  const close = () => (copiedOnce ? onClose() : setAsking(true));
  return (
    <Modal opened onClose={close} closeOnEscape={false} closeOnClickOutside={false} withCloseButton={false} title={reveal.replaced === undefined ? 'Enrollment token issued' : 'Token rotated'}>
      <Stack>
        <Text component="div">
          {reveal.replaced === undefined ? null : (
            <>
              Token <Breakable text={reveal.replaced} /> stops working now.{' '}
            </>
          )}
          Token <Breakable text={token.tokenId} /> is valid for {validityMinutesOf(token)} minutes, until{' '}
          <time dateTime={token.expiresAt}>{formatInstant(token.expiresAt)}</time>, for a host of: <Constraints constraints={token.constraints} />
        </Text>
        <Text>This secret is shown only now; Taskelith keeps only its hash. Copy it before you close this dialog.</Text>
        <TextInput label="Enrollment token secret" value={secret} readOnly />
        <Group>
          <Button onClick={() => clipboard.copy(secret)}>{clipboard.copied ? 'Copied' : 'Copy'}</Button>
          <Text role="status" aria-live="polite">
            {clipboard.copied ? 'Copied to the clipboard.' : clipboard.error === null ? '' : 'Could not copy; select the text and copy it.'}
          </Text>
        </Group>
        <Text>
          The worker reads the secret from the environment variable TASKELITH_ENROLLMENT_TOKEN, the control plane's address from
          TASKELITH_CONTROL_PLANE_URL, and the installation CA's fingerprint from TASKELITH_INSTALLATION_CA_SHA256, which the
          installation's CLI enrollment bundle prints.
        </Text>
        {asking ? (
          <Alert color="red" variant="light" title="Close without copying?">
            <Stack align="flex-start" gap="xs">
              <Text>The secret cannot be shown again.</Text>
              <Group>
                <Button variant="default" onClick={() => setAsking(false)}>
                  Keep open
                </Button>
                <Button color="red" variant="light" onClick={onClose}>
                  Close anyway
                </Button>
              </Group>
            </Stack>
          </Alert>
        ) : (
          <Group>
            <Button variant="default" onClick={close}>
              Close
            </Button>
          </Group>
        )}
      </Stack>
    </Modal>
  );
}

const FAILURES: Readonly<Record<ReadFailure, { readonly title: string; readonly text: string }>> = {
  unauthenticated: {
    title: 'Your session ended',
    text: 'The control plane answered this read as one without a session, which may have ended before a newer one began. Retry reads the tokens again.',
  },
  unavailable: {
    title: 'The enrollment tokens cannot be loaded',
    text: 'The control plane did not answer with the pending tokens, so none is shown rather than a list that may be wrong.',
  },
  denied: {
    title: 'No access to the enrollment tokens',
    text: 'Your session holds no role that lets you list the enrollment tokens.',
  },
  'not-found': {
    title: 'The enrollment tokens cannot be loaded',
    text: 'The control plane knows no enrollment tokens at this address.',
  },
};

function TokensFailure({ failure, onRetry }: { readonly failure: ReadFailed; readonly onRetry: () => void }) {
  const { title, text } = FAILURES[failure.kind];
  return (
    <LoadError title={title} onRetry={onRetry}>
      {withRequiredRole(text, failure)}
    </LoadError>
  );
}
