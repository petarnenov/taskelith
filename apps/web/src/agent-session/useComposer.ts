import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Turn } from '../board/board';
import { useBoardServices } from '../board/BoardServices';
import { useSession } from '../session/SessionProvider';
import { outcomeOf, restoredSubmissions, type Outcome, type Submission, type SubmissionState } from './composer-model';
import type { TurnRecord } from './turn-records';
import { useTurnRecords } from './TurnRecordsProvider';

export interface Composer {
  readonly submissions: readonly Submission[];
  readonly sending: boolean;
  // The denied submission shown, while its notice stands.
  readonly denied?: Extract<SubmissionState, { status: 'denied' }>;
  readonly send: (text: string) => void;
  readonly retry: (key: string) => void;
  readonly dismiss: (key: string) => void;
}

interface ComposerOptions {
  readonly projectId: string;
  readonly sessionId: string;
  readonly showTurn: (turn: Turn) => void;
}

const PENDING: SubmissionState = { status: 'pending' };

// An outcome the composer acts on; the token retry is handled on the way.
type Answer = Exclude<Outcome, { kind: 'retry-with-new-token' }>;

// The submissions of the session from this tab: each sent with its own key
// (decision Q2), kept in the records until the control plane settles it.
export function useComposer({ projectId, sessionId, showTurn }: ComposerOptions): Composer {
  const { gateway, clock } = useBoardServices();
  const { refresh } = useSession();
  const records = useTurnRecords();
  const [submissions, setSubmissions] = useState<readonly Submission[]>(() =>
    restoredSubmissions(records.list(projectId, sessionId)),
  );
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // One record is sent at a time; a send or retry meanwhile does nothing.
  const inFlight = useRef(false);

  const show = useCallback((key: string, state: SubmissionState | undefined) => {
    if (!mounted.current) return;
    setSubmissions((known) =>
      state === undefined ? known.filter((entry) => entry.key !== key) : known.map((entry) => (entry.key === key ? { ...entry, state } : entry)),
    );
  }, []);

  // The answer to the record: the session read again once after a CSRF
  // refusal, and the key sent again only with a renewed token (decision Q3).
  const answerOf = useCallback(
    async (record: TurnRecord): Promise<Answer | undefined> => {
      const { key, text } = record;
      let tokenRefreshed = false;
      for (;;) {
        const outcome = outcomeOf(await gateway.submitTurn(projectId, sessionId, { idempotencyKey: key, text }), tokenRefreshed);
        if (outcome.kind !== 'retry-with-new-token') return outcome;
        const renewed = await refresh();
        if (renewed.kind === 'unavailable') return { kind: 'retryable', failure: 'token-not-renewed' };
        if (renewed.kind === 'anonymous') return undefined;
        tokenRefreshed = true;
      }
    },
    [gateway, projectId, sessionId, refresh],
  );

  // The record's fate follows the answer whether or not the page still
  // shows the composer, so no settled key is sent again after a reload.
  const settle = useCallback(
    async (record: TurnRecord) => {
      const { key } = record;
      show(key, PENDING);
      const outcome = await answerOf(record);
      if (outcome === undefined) return;
      if (outcome.kind === 'retryable') {
        show(key, { status: 'failed', failure: outcome.failure });
        return;
      }
      records.remove(projectId, sessionId, key);
      if (outcome.kind === 'recorded') {
        show(key, undefined);
        showTurn(outcome.turn);
      } else if (outcome.kind === 'duplicate') {
        show(key, { status: 'duplicate', turn: outcome.turn });
        showTurn(outcome.turn);
      } else show(key, outcome.state);
    },
    [projectId, sessionId, records, answerOf, show, showTurn],
  );

  const deliver = useCallback(
    async (record: TurnRecord) => {
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        await settle(record);
      } finally {
        inFlight.current = false;
      }
    },
    [settle],
  );

  const send = useCallback(
    (text: string) => {
      if (inFlight.current) return;
      const record: TurnRecord = { key: crypto.randomUUID(), text, sentAt: new Date(clock.now()).toISOString() };
      records.add(projectId, sessionId, record);
      setSubmissions((known) => [...known, { ...record, state: PENDING }]);
      void deliver(record);
    },
    [clock, records, projectId, sessionId, deliver],
  );

  const retry = useCallback(
    (key: string) => {
      const record = submissions.find((entry) => entry.key === key);
      if (record !== undefined) void deliver(record);
    },
    [submissions, deliver],
  );

  const dismiss = useCallback((key: string) => show(key, undefined), [show]);

  return useMemo(
    () => ({
      submissions,
      sending: submissions.some((entry) => entry.state.status === 'pending'),
      denied: deniedOf(submissions),
      send,
      retry,
      dismiss,
    }),
    [submissions, send, retry, dismiss],
  );
}

function deniedOf(submissions: readonly Submission[]): Composer['denied'] {
  for (const { state } of submissions) {
    if (state.status === 'denied') return state;
  }
  return undefined;
}
