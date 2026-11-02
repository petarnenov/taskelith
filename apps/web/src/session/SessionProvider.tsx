import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Clock } from './clock';
import type { Credentials, LoginOutcome, LogoutOutcome, Operator, SessionGateway, SessionRead } from './session';

// Why the sign-in page shows: a first visit, an ended session, or a logout.
export type SignedOutNotice = 'none' | 'expired' | 'signed-out';

export type SessionView =
  | { readonly status: 'checking' }
  | { readonly status: 'unavailable' }
  | { readonly status: 'signed-out'; readonly notice: SignedOutNotice }
  | { readonly status: 'signed-in'; readonly operator: Operator };

export interface Session {
  readonly view: SessionView;
  readonly retry: () => void;
  readonly logIn: (credentials: Credentials) => Promise<LoginOutcome>;
  readonly logOut: () => Promise<LogoutOutcome>;
}

// The session is read again this long after its end, so that a client
// clock slightly ahead of the server's does not read a live session.
export const EXPIRY_MARGIN_MILLISECONDS = 10_000;

const SessionContext = createContext<Session | undefined>(undefined);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (session === undefined) throw new Error('useSession needs a SessionProvider.');
  return session;
}

interface SessionProviderProps {
  readonly gateway: SessionGateway;
  readonly clock: Clock;
  readonly children: ReactNode;
}

export function SessionProvider({ gateway, clock, children }: SessionProviderProps) {
  const [view, setView] = useState<SessionView>({ status: 'checking' });
  const [checks, setChecks] = useState(0);
  useInitialCheck(gateway, checks, setView);
  useExpiryCheck(gateway, clock, view, setView);

  const retry = useCallback(() => {
    setView({ status: 'checking' });
    setChecks((count) => count + 1);
  }, []);

  const logIn = useCallback(
    async (credentials: Credentials) => {
      const outcome = await gateway.logIn(credentials);
      if (outcome.kind === 'logged-in') setView({ status: 'signed-in', operator: outcome.operator });
      if (outcome.kind === 'rejected' && outcome.reason === 'form-expired') await renewAnonymousSession(gateway, setView);
      return outcome;
    },
    [gateway],
  );

  const logOut = useCallback(async () => {
    const outcome = await gateway.logOut();
    if (outcome.kind === 'logged-out') setView(viewOf(await gateway.read(), 'signed-out'));
    return outcome;
  }, [gateway]);

  const session = useMemo(() => ({ view, retry, logIn, logOut }), [view, retry, logIn, logOut]);
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

type SetView = (view: SessionView) => void;

function useInitialCheck(gateway: SessionGateway, checks: number, setView: SetView): void {
  useEffect(() => {
    let current = true;
    void gateway.read().then((read) => {
      if (current) setView(viewOf(read, 'none'));
    });
    return () => {
      current = false;
    };
  }, [gateway, checks, setView]);
}

// At the end the session announced, read it again: another tab or request
// may have renewed it; otherwise the sign-in page says that it expired.
function useExpiryCheck(gateway: SessionGateway, clock: Clock, view: SessionView, setView: SetView): void {
  const operator = view.status === 'signed-in' ? view.operator : undefined;
  useEffect(() => {
    if (operator === undefined) return undefined;
    let current = true;
    const delay = Math.max(operator.expiresAt - clock.now(), 0) + EXPIRY_MARGIN_MILLISECONDS;
    const cancel = clock.schedule(delay, () => {
      void gateway.read().then((read) => {
        if (current) setView(viewOf(read, 'expired'));
      });
    });
    return () => {
      current = false;
      cancel();
    };
  }, [gateway, clock, operator, setView]);
}

// A fresh anonymous session gives the next login a valid CSRF token; a
// session that another tab logged in meanwhile is taken over.
async function renewAnonymousSession(gateway: SessionGateway, setView: SetView): Promise<void> {
  const read = await gateway.read();
  if (read.kind === 'authenticated') setView(viewOf(read, 'none'));
}

function viewOf(read: SessionRead, notice: SignedOutNotice): SessionView {
  if (read.kind === 'authenticated') return { status: 'signed-in', operator: read.operator };
  if (read.kind === 'anonymous') return { status: 'signed-out', notice };
  return { status: 'unavailable' };
}
