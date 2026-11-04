import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { expiringCall } from '../session/expiring-call';
import { useSession } from '../session/SessionProvider';
import type { WorkersGateway } from './workers';

const WorkersGatewayContext = createContext<WorkersGateway | undefined>(undefined);

export function WorkersServicesProvider({ gateway, children }: { readonly gateway: WorkersGateway; readonly children: ReactNode }) {
  return <WorkersGatewayContext.Provider value={gateway}>{children}</WorkersGatewayContext.Provider>;
}

// The workers gateway as the screen uses it: an unauthenticated answer
// ends the session in the shell, which shows the sign-in.
export function useWorkersGateway(): WorkersGateway {
  const gateway = useContext(WorkersGatewayContext);
  if (gateway === undefined) throw new Error('useWorkersGateway needs a WorkersServicesProvider.');
  const { expiryOfRequest } = useSession();
  return useMemo(() => {
    const checked = expiringCall(expiryOfRequest);
    return { listWorkers: () => checked(gateway.listWorkers) };
  }, [gateway, expiryOfRequest]);
}
