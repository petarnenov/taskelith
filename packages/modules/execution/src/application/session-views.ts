import type { Session } from '../domain/session-records.js';
import type { SessionSummary } from '../ports/ui-events.js';

// A session as the service shows it: only its output window's bounds show,
// and `readOutput` pages the entries.
export type SessionView = Omit<Session, 'output'> & { readonly outputWindow: OutputBounds };

export interface OutputBounds {
  readonly lastPosition: number;
  // Absent while the window holds no entry.
  readonly earliestRetained?: number;
}

export function viewOf(session: Session): SessionView {
  const { output, ...view } = session;
  const earliest = output.entries[0]?.position;
  const outputWindow = Object.freeze({ lastPosition: output.lastPosition, ...(earliest === undefined ? {} : { earliestRetained: earliest }) });
  return Object.freeze({ ...view, outputWindow });
}

// What the AgentSession record shows of a session.
export function summaryOf(view: SessionView): SessionSummary {
  const { turns, requests, ...summary } = view;
  return Object.freeze({ ...summary, turnCount: turns.length, requestCount: requests.length });
}
