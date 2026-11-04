import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Turn } from '../board/board';
import { useBoardServices } from '../board/BoardServices';
import { useSession } from '../session/SessionProvider';
import { outcomeOf, restoredSubmissions, type Submission, type SubmissionState } from './composer-model';
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

type Deliver = (record: TurnRecord, tokenRefreshed: boolean) => Promise<void>;

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

  const show = useCallback((key: string, state: SubmissionState | undefined) => {
    if (!mounted.current) return;
    setSubmissions((known) =>
      state === undefined ? known.filter((entry) => entry.key !== key) : known.map((entry) => (entry.key === key ? { ...entry, state } : entry)),
    );
  }, []);

  // The record's fate follows the answer whether or not the page still
  // shows the composer, so no settled key is sent again after a reload.
  const deliver: Deliver = useCallback(
    async (record, tokenRefreshed) => {
      const { key, text } = record;
      show(key, PENDING);
      const outcome = outcomeOf(await gateway.submitTurn(projectId, sessionId, { idempotencyKey: key, text }), tokenRefreshed);
      if (outcome.kind === 'retry-with-new-token') {
        const renewed = await refresh();
        if (renewed.kind === 'authenticated') return deliver(record, true);
        if (renewed.kind === 'unavailable') show(key, { status: 'failed', failure: 'token-not-renewed' });
        return;
      }
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
    [gateway, projectId, sessionId, records, refresh, show, showTurn],
  );

  const send = useCallback(
    (text: string) => {
      const record: TurnRecord = { key: crypto.randomUUID(), text, sentAt: new Date(clock.now()).toISOString() };
      records.add(projectId, sessionId, record);
      setSubmissions((known) => [...known, { ...record, state: PENDING }]);
      void deliver(record, false);
    },
    [clock, records, projectId, sessionId, deliver],
  );

  const retry = useCallback(
    (key: string) => {
      const record = submissions.find((entry) => entry.key === key);
      if (record !== undefined) void deliver(record, false);
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
