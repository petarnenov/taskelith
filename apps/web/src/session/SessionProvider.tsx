import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  // A request answered that no valid session was presented.
  readonly expire: () => void;
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
  const settled = useMemo(() => settledGateway(gateway), [gateway]);
  const { view, currentView, show, sinceNow } = useSessionView();
  const [checks, setChecks] = useState(0);
  useInitialCheck(settled, checks, sinceNow);
  useExpiryCheck(settled, clock, view, sinceNow);

  const retry = useCallback(() => {
    show({ status: 'checking' });
    setChecks((count) => count + 1);
  }, [show]);

  const logIn = useCallback(
    async (credentials: Credentials) => {
      const showIfUnchanged = sinceNow();
      const outcome = await settled.logIn(credentials);
      if (outcome.kind === 'logged-in') showIfUnchanged({ status: 'signed-in', operator: outcome.operator });
      if (outcome.kind === 'rejected' && outcome.reason === 'form-expired') {
        await renewAnonymousSession(settled, sinceNow());
      }
      return outcome;
    },
    [settled, sinceNow],
  );

  // The shell leaves as soon as the session ended; the read that follows
  // only fetches the token of the next anonymous session.
  const logOut = useCallback(async () => {
    const showIfUnchanged = sinceNow();
    const outcome = await settled.logOut();
    if (outcome.kind === 'logged-out' && showIfUnchanged(SIGNED_OUT)) {
      await renewAnonymousSession(settled, sinceNow());
    }
    return outcome;
  }, [settled, sinceNow]);

  // Only a signed-in view ends; the read that follows fetches the token
  // of the next anonymous session, or takes over another tab's login.
  const expire = useCallback(() => {
    if (currentView().status !== 'signed-in') return;
    show(EXPIRED);
    void renewAnonymousSession(settled, sinceNow());
  }, [currentView, show, settled, sinceNow]);

  const session = useMemo(() => ({ view, retry, logIn, logOut, expire }), [view, retry, logIn, logOut, expire]);
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

const SIGNED_OUT: SessionView = { status: 'signed-out', notice: 'signed-out' };
const EXPIRED: SessionView = { status: 'signed-out', notice: 'expired' };

// Shows the view only if no other view showed since the request was sent,
// so that a late answer never undoes a newer one; reports whether it did.
type ShowIfUnchanged = (view: SessionView) => boolean;

function useSessionView() {
  const [view, setView] = useState<SessionView>({ status: 'checking' });
  const latest = useRef(view);
  const changes = useRef(0);
  const currentView = useCallback(() => latest.current, []);
  const show = useCallback((next: SessionView) => {
    changes.current += 1;
    latest.current = next;
    setView(next);
  }, []);
  const sinceNow = useCallback((): ShowIfUnchanged => {
    const sentAt = changes.current;
    return (next) => {
      if (sentAt !== changes.current) return false;
      show(next);
      return true;
    };
  }, [show]);
  return { view, currentView, show, sinceNow };
}

function useInitialCheck(gateway: SessionGateway, checks: number, sinceNow: () => ShowIfUnchanged): void {
  useEffect(() => {
    let current = true;
    const showIfUnchanged = sinceNow();
    void gateway.read().then((read) => {
      if (current) showIfUnchanged(viewOf(read, 'none'));
    });
    return () => {
      current = false;
    };
  }, [gateway, checks, sinceNow]);
}

// At the end the session announced, read it again: another tab or request
// may have renewed it; otherwise the sign-in page says that it expired.
function useExpiryCheck(gateway: SessionGateway, clock: Clock, view: SessionView, sinceNow: () => ShowIfUnchanged): void {
  const operator = view.status === 'signed-in' ? view.operator : undefined;
  useEffect(() => {
    if (operator === undefined) return undefined;
    let current = true;
    const delay = Math.max(operator.expiresAt - clock.now(), 0) + EXPIRY_MARGIN_MILLISECONDS;
    const cancel = clock.schedule(delay, () => {
      const showIfUnchanged = sinceNow();
      void gateway.read().then((read) => {
        if (current) showIfUnchanged(viewOf(read, 'expired'));
      });
    });
    return () => {
      current = false;
      cancel();
    };
  }, [gateway, clock, operator, sinceNow]);
}

// A fresh anonymous session gives the next login a valid CSRF token; a
// session that another tab logged in meanwhile is taken over.
async function renewAnonymousSession(gateway: SessionGateway, showIfUnchanged: ShowIfUnchanged): Promise<void> {
  const read = await gateway.read();
  if (read.kind === 'authenticated') showIfUnchanged(viewOf(read, 'none'));
}

function viewOf(read: SessionRead, notice: SignedOutNotice): SessionView {
  if (read.kind === 'authenticated') return { status: 'signed-in', operator: read.operator };
  if (read.kind === 'anonymous') return { status: 'signed-out', notice };
  return { status: 'unavailable' };
}

// The shell reads a gateway that throws as an unreachable control plane.
function settledGateway(gateway: SessionGateway): SessionGateway {
  return {
    read: () => settle(gateway.read, { kind: 'unavailable' }),
    logIn: (credentials) => settle(() => gateway.logIn(credentials), { kind: 'unavailable' }),
    logOut: () => settle(gateway.logOut, { kind: 'failed' }),
  };
}

async function settle<T>(call: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await call();
  } catch {
    return fallback;
  }
}
