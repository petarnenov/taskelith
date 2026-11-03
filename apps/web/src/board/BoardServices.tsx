import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Clock } from '../session/clock';
import { useSession } from '../session/SessionProvider';
import type { BoardGateway, ReadResult } from './board';

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
// reads ends the session in the shell, which then shows the sign-in page.
export function useBoardServices(): BoardServices {
  const services = useContext(BoardServicesContext);
  if (services === undefined) throw new Error('useBoardServices needs a BoardServicesProvider.');
  const { expire } = useSession();
  const { gateway, clock } = services;
  return useMemo(() => ({ gateway: expiringGateway(gateway, expire), clock }), [gateway, clock, expire]);
}

function expiringGateway(gateway: BoardGateway, expire: () => void): BoardGateway {
  async function checked<T>(read: () => Promise<ReadResult<T>>): Promise<ReadResult<T>> {
    const result = await settle(read);
    if (result.kind === 'unauthenticated') expire();
    return result;
  }
  return {
    listProjects: () => checked(gateway.listProjects),
    readBoard: (projectId) => checked(() => gateway.readBoard(projectId)),
    openEvents: gateway.openEvents,
  };
}

// A gateway that throws reads as an unreachable control plane.
async function settle<T>(read: () => Promise<ReadResult<T>>): Promise<ReadResult<T>> {
  try {
    return await read();
  } catch {
    return { kind: 'unavailable' };
  }
}
