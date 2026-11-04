import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Clock } from '../session/clock';
import { useSession } from '../session/SessionProvider';
import type { BoardGateway } from './board';

export interface BoardServices {
  readonly gateway: BoardGateway;
  readonly clock: Clock;
}

const BoardServicesContext = createContext<BoardServices | undefined>(undefined);

export function BoardServicesProvider({ children, ...services }: BoardServices & { readonly children: ReactNode }) {
  const { gateway, clock } = services;
  const value = useMemo(() => ({ gateway, clock }), [gateway, clock]);
  return <BoardServicesContext.Provider value={value}>{children}</BoardServicesContext.Provider>;
}

// The gateway as screens use it: an unauthenticated answer of any of its
// reads or commands ends the session in the shell, which shows the sign-in.
export function useBoardServices(): BoardServices {
  const services = useContext(BoardServicesContext);
  if (services === undefined) throw new Error('useBoardServices needs a BoardServicesProvider.');
  const { expiryOfRequest } = useSession();
  const { gateway, clock } = services;
  return useMemo(
    () => ({ gateway: expiringGateway(gateway, expiryOfRequest), clock }),
    [gateway, clock, expiryOfRequest],
  );
}

const UNAVAILABLE = { kind: 'unavailable' } as const;

interface Settled {
  readonly kind: string;
}

function expiringGateway(gateway: BoardGateway, expiryOfRequest: () => () => void): BoardGateway {
  async function checked<R extends Settled>(call: () => Promise<R>): Promise<R | typeof UNAVAILABLE> {
    const expire = expiryOfRequest();
    const result = await settle(call);
    if (result.kind === 'unauthenticated') expire();
    return result;
  }
  return {
    listProjects: () => checked(gateway.listProjects),
    readBoard: (projectId) => checked(() => gateway.readBoard(projectId)),
    readTaskDetail: (projectId, runId) => checked(() => gateway.readTaskDetail(projectId, runId)),
    listAgentSessions: (projectId, runId) => checked(() => gateway.listAgentSessions(projectId, runId)),
    readAgentSession: (projectId, sessionId) => checked(() => gateway.readAgentSession(projectId, sessionId)),
    listAgentSessionTurns: (projectId, sessionId, after) =>
      checked(() => gateway.listAgentSessionTurns(projectId, sessionId, after)),
    submitTurn: (projectId, sessionId, submission) => checked(() => gateway.submitTurn(projectId, sessionId, submission)),
    openEvents: gateway.openEvents,
  };
}

// A gateway that throws reads as an unreachable control plane.
async function settle<R>(call: () => Promise<R>): Promise<R | typeof UNAVAILABLE> {
  try {
    return await call();
  } catch {
    return UNAVAILABLE;
  }
}
