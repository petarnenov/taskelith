import { Alert, Button, Group, Loader, Paper, Stack, Text, Textarea } from '@mantine/core';
import { useReducedMotion } from '@mantine/hooks';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { AgentSession, Turn } from '../board/board';
import {
  checkTurnText,
  COUNTER_FROM_LENGTH,
  MAX_TURN_TEXT_LENGTH,
  type RetryableFailure,
  type Submission,
  type TextCheck,
} from './composer-model';
import { TurnText } from './TurnTimeline';
import { useComposer, type Composer as ComposerModel } from './useComposer';

// Why the composer takes no turn (decision Q6): the session is not shown,
// stopped at its limit, a turn is being sent, or a 403 named the role.
export type ComposerBlock = 'loading' | 'failed' | 'stopped' | 'sending' | 'denied';

interface ComposerProps {
  readonly projectId: string;
  readonly sessionId: string;
  // The session once shown; undefined while it loads or failed.
  readonly session?: AgentSession;
  readonly feedFailed: boolean;
  readonly showTurn: (turn: Turn) => void;
}

// The composer stays at the end of the session page, sticky (decision Q9),
// and sends each message with its own key; the POC's "Message the agent".
export function Composer({ projectId, sessionId, session, feedFailed, showTurn }: ComposerProps) {
  const composer = useComposer({ projectId, sessionId, showTurn });
  const [draft, setDraft] = useState('');
  const check = checkTurnText(draft);
  const block = blockOf({ session, feedFailed, composer });
  const blocked = block !== undefined;
  const field = useRef<HTMLTextAreaElement>(null);
  // The send disables the button or hides the Retry that held the focus; the
  // answer gives it back to the field, unless a block still holds.
  const awaitingAnswer = useRef(false);
  useEffect(() => {
    if (composer.sending || !awaitingAnswer.current) return;
    awaitingAnswer.current = false;
    if (!blocked) field.current?.focus();
  }, [composer.sending, blocked]);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (blocked || check.kind !== 'ok') return;
    awaitingAnswer.current = true;
    composer.send(check.text);
    setDraft('');
  }

  function retry(key: string): void {
    awaitingAnswer.current = true;
    composer.retry(key);
  }

  return (
    <Paper component="form" aria-label="Composer" onSubmit={submit} pos="sticky" bottom={0} withBorder p="md" radius="md">
      <Stack gap="sm">
        <SubmissionList submissions={composer.submissions} blocked={blocked} onRetry={retry} onDismiss={composer.dismiss} />
        <Textarea
          ref={field}
          label="Message the agent"
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          disabled={blocked}
          rows={3}
          error={check.kind === 'too-long' ? overLimit(check.length) : undefined}
          description={blocked ? blockText(block, composer) : counterText(check)}
        />
        <Group justify="flex-end">
          <Button type="submit" disabled={blocked || check.kind !== 'ok'}>
            Send
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}

interface BlockInputs {
  readonly session: AgentSession | undefined;
  readonly feedFailed: boolean;
  readonly composer: ComposerModel;
}

function blockOf({ session, feedFailed, composer }: BlockInputs): ComposerBlock | undefined {
  if (feedFailed) return 'failed';
  if (session === undefined) return 'loading';
  if (session.limit !== undefined) return 'stopped';
  if (composer.sending) return 'sending';
  return composer.denied === undefined ? undefined : 'denied';
}

const BLOCK_TEXTS: Readonly<Record<Exclude<ComposerBlock, 'denied'>, string>> = {
  loading: 'The composer opens once the session is loaded.',
  failed: 'The session could not be loaded, so no turn can be sent.',
  stopped: 'The session stopped at an account limit and accepts no turn.',
  sending: 'Sending the turn…',
};

function blockText(block: ComposerBlock, composer: ComposerModel): string {
  return block === 'denied' ? deniedText(composer.denied?.requiredRole) : BLOCK_TEXTS[block];
}

function deniedText(requiredRole: string | undefined): string {
  if (requiredRole === undefined) return 'You hold no role on this project that lets you send a turn.';
  return `Sending a turn needs the role ${requiredRole}.`;
}

const FORMAT = new Intl.NumberFormat('en-US');

function counterText(check: TextCheck): string | undefined {
  if (check.kind !== 'ok' || check.length < COUNTER_FROM_LENGTH) return undefined;
  return `${FORMAT.format(check.length)} of ${FORMAT.format(MAX_TURN_TEXT_LENGTH)} characters`;
}

function overLimit(length: number): string {
  const over = length - MAX_TURN_TEXT_LENGTH;
  return `The message is ${FORMAT.format(over)} ${over === 1 ? 'character' : 'characters'} over the limit of ${FORMAT.format(MAX_TURN_TEXT_LENGTH)}.`;
}

interface SubmissionListProps {
  readonly submissions: readonly Submission[];
  // A retry sends a turn, so it waits for the same reasons as a send.
  readonly blocked: boolean;
  readonly onRetry: (key: string) => void;
  readonly onDismiss: (key: string) => void;
}

function SubmissionList({ submissions, blocked, onRetry, onDismiss }: SubmissionListProps) {
  if (submissions.length === 0) return null;
  return (
    <Stack gap="xs">
      {submissions.map((submission) => (
        <SubmissionNotice key={submission.key} submission={submission} blocked={blocked} onRetry={onRetry} onDismiss={onDismiss} />
      ))}
    </Stack>
  );
}

interface SubmissionNoticeProps {
  readonly submission: Submission;
  readonly blocked: boolean;
  readonly onRetry: (key: string) => void;
  readonly onDismiss: (key: string) => void;
}

// Each submission's honest state with its text, which shows here and in
// the timeline only; a retry sends the same key, a dismiss hides a settled one.
function SubmissionNotice({ submission, blocked, onRetry, onDismiss }: SubmissionNoticeProps) {
  const { key, text, state } = submission;
  const notice = noticeOf(state);
  return (
    <Alert color={notice.color} variant="light" title={notice.title} role={notice.color === 'red' ? 'alert' : 'status'}>
      <Stack gap="xs" align="flex-start">
        <TurnText text={text} />
        <NoticeText state={state} />
        {notice.action === 'retry' ? (
          <Button variant="default" size="compact-md" disabled={blocked} onClick={() => onRetry(key)}>
            Retry
          </Button>
        ) : null}
        {notice.action === 'dismiss' ? (
          <Button variant="default" size="compact-md" onClick={() => onDismiss(key)}>
            Dismiss
          </Button>
        ) : null}
      </Stack>
    </Alert>
  );
}

function NoticeText({ state }: { readonly state: Submission['state'] }) {
  const reducedMotion = useReducedMotion();
  if (state.status === 'pending') {
    return (
      <Group gap="xs" aria-busy="true">
        {reducedMotion ? null : <Loader size="xs" aria-hidden="true" />}
        <Text size="sm">Waiting for the control plane to record the turn…</Text>
      </Group>
    );
  }
  return <Text size="sm">{stateText(state)}</Text>;
}

interface Notice {
  readonly title: string;
  readonly color: 'indigo' | 'gray' | 'red';
  readonly action?: 'retry' | 'dismiss';
}

type RefusedState = Extract<Submission['state'], { status: 'refused' }>;

const NOTICES: Readonly<Record<Exclude<Submission['state']['status'], 'refused'>, Notice>> = {
  pending: { title: 'Sending', color: 'indigo' },
  unconfirmed: { title: 'Not confirmed', color: 'gray', action: 'retry' },
  failed: { title: 'Not sent', color: 'red', action: 'retry' },
  duplicate: { title: 'Already recorded', color: 'gray', action: 'dismiss' },
  denied: { title: 'No access', color: 'red', action: 'dismiss' },
};

const REFUSAL_TITLES: Readonly<Record<RefusedState['reason'], string>> = {
  'key-reused': 'Key reused',
  'session-stopped': 'Session stopped',
  'csrf-rejected': 'Refused',
  invalid: 'Refused',
  'not-found': 'Session not found',
};

function noticeOf(state: Submission['state']): Notice {
  if (state.status === 'refused') return { title: REFUSAL_TITLES[state.reason], color: 'red', action: 'dismiss' };
  return NOTICES[state.status];
}

const RETRY_SAME_KEY = 'Retry sends it again with the same key, so the control plane records it once.';

function stateText(state: Exclude<Submission['state'], { status: 'pending' }>): string {
  switch (state.status) {
    case 'unconfirmed':
      return `This message was sent before the page was reloaded and its answer was not seen. ${RETRY_SAME_KEY}`;
    case 'failed':
      return `${FAILURE_TEXTS[state.failure]} ${RETRY_SAME_KEY}`;
    case 'duplicate':
      return `The control plane had recorded this message as turn #${state.turn.position}; nothing was sent again.`;
    case 'refused':
      return REFUSAL_TEXTS[state.reason];
    case 'denied':
      return deniedText(state.requiredRole);
  }
}

const FAILURE_TEXTS: Readonly<Record<RetryableFailure, string>> = {
  unavailable: 'The control plane did not answer, so whether it recorded the turn is unknown.',
  unauthenticated: 'The control plane answered as to a request without a session.',
  'token-not-renewed': 'The control plane refused the request’s token, and the session could not be read again to renew it.',
  'session-changed': 'Another sign-in replaced the session before the turn could be sent again, so it was not.',
};

const REFUSAL_TEXTS: Readonly<Record<RefusedState['reason'], string>> = {
  'key-reused': 'The control plane knows this key for another message, so it refused this one. Send the message again to use a new key.',
  'session-stopped': 'The session stopped at an account limit, so it refused the turn.',
  'csrf-rejected': 'The control plane refused the request’s token twice, once after the session was read again. Send the message again.',
  invalid: 'The control plane refused the message as invalid.',
  'not-found': 'The control plane knows no such agent session in this project.',
};
