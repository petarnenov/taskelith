import { useCallback, useEffect, useState } from 'react';
import type { AgentSession, ReadFailed, TaskDetail } from '../board/board';
import { useBoardServices } from '../board/BoardServices';

export type CardSessionsState =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly failure: ReadFailed }
  | { readonly status: 'listed'; readonly sessions: readonly AgentSession[] };

export interface CardSessions {
  readonly state: CardSessionsState;
  readonly retry: () => void;
}

// The sessions of the card's tasks, listed again with each task detail
// shown, so a new session shows; the last list stays while one is read.
export function useCardSessions(projectId: string, runId: string, detail: TaskDetail | undefined): CardSessions {
  const { gateway } = useBoardServices();
  const [state, setState] = useState<CardSessionsState>({ status: 'loading' });
  const [retries, setRetries] = useState(0);

  useEffect(() => {
    if (detail === undefined) return undefined;
    let current = true;
    void gateway.listAgentSessions(projectId, runId).then((result) => {
      if (!current) return;
      setState(result.kind === 'read' ? { status: 'listed', sessions: result.value } : { status: 'failed', failure: result });
    });
    return () => {
      current = false;
    };
  }, [projectId, runId, gateway, detail, retries]);

  const retry = useCallback(() => setRetries((count) => count + 1), []);
  return { state, retry };
}
