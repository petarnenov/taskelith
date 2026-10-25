import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const SCREENS = [
  'board',
  'session',
  'reviews',
  'workers',
  'new-task',
  'knowledge',
  'inbox',
  'integrations',
  'plugins',
  'states',
] as const;
export type Screen = (typeof SCREENS)[number];

export type InboxDecision = 'approved' | 'denied' | 'changes';

export const INBOX_IDS = ['kernel-approval', 'codex-spec'] as const;
export type InboxId = (typeof INBOX_IDS)[number];

interface PocState {
  screen: Screen;
  go: (screen: Screen) => void;
  decisions: Partial<Record<InboxId, InboxDecision>>;
  decide: (id: InboxId, decision: InboxDecision) => void;
  needsYouCount: number;
  signedIn: boolean;
  signIn: () => void;
  signOut: () => void;
}

const PocContext = createContext<PocState | null>(null);

function screenFromHash(): Screen {
  const name = window.location.hash.replace('#', '') as Screen;
  return (SCREENS as readonly string[]).includes(name) ? name : 'board';
}

export function PocProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>(screenFromHash);
  const [decisions, setDecisions] = useState<PocState['decisions']>({});
  const [signedIn, setSignedIn] = useState(true);

  useEffect(() => {
    const onHash = () => setScreen(screenFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = (next: Screen) => {
    window.location.hash = next;
    setScreen(next);
    window.scrollTo(0, 0);
  };
  const decide = (id: InboxId, decision: InboxDecision) =>
    setDecisions((current) => ({ ...current, [id]: decision }));
  const needsYouCount = INBOX_IDS.filter((id) => !decisions[id]).length;

  return (
    <PocContext.Provider
      value={{
        screen,
        go,
        decisions,
        decide,
        needsYouCount,
        signedIn,
        signIn: () => setSignedIn(true),
        signOut: () => setSignedIn(false),
      }}
    >
      {children}
    </PocContext.Provider>
  );
}

export function usePoc(): PocState {
  const state = useContext(PocContext);
  if (!state) throw new Error('usePoc needs a PocProvider');
  return state;
}
