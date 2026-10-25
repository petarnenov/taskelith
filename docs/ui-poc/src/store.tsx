import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

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

export type RuntimeDecision = 'approve-once' | 'deny';
export type SpecVerdict = 'approved' | 'rejected';
export type InboxDecision = RuntimeDecision | SpecVerdict;

export const INBOX_IDS = ['kernel-approval', 'codex-spec'] as const;
export type InboxId = (typeof INBOX_IDS)[number];

export type Role = 'installation-owner' | 'project-maintainer' | 'project-operator' | 'project-viewer';

export interface Persona {
  id: string;
  initials: string;
  name: string;
  roles: Role[];
}

export const PERSONAS: Persona[] = [
  { id: 'pp', initials: 'PP', name: 'PP', roles: ['installation-owner', 'project-maintainer'] },
  { id: 'op', initials: 'OP', name: 'An operator', roles: ['project-operator'] },
  { id: 'vw', initials: 'VW', name: 'A viewer', roles: ['project-viewer'] },
];

// What each role may do, from the trust model section 3; a maintainer also
// holds every operator capability.
export type Capability =
  | 'answer-runtime-request'
  | 'send-turn'
  | 'stop-or-retry'
  | 'submit-task'
  | 'approve-gate'
  | 'change-settings'
  | 'add-standing-rule'
  | 'reconcile'
  | 'manage-workers';

const OPERATOR: Capability[] = ['answer-runtime-request', 'send-turn', 'stop-or-retry', 'submit-task'];
const MAINTAINER: Capability[] = [
  ...OPERATOR,
  'approve-gate',
  'change-settings',
  'add-standing-rule',
  'reconcile',
];
const GRANTS: Record<Role, Capability[]> = {
  'installation-owner': ['manage-workers'],
  'project-maintainer': MAINTAINER,
  'project-operator': OPERATOR,
  'project-viewer': [],
};

export const ROLE_FOR: Record<Capability, string> = {
  'answer-runtime-request': 'project-operator',
  'send-turn': 'project-operator',
  'stop-or-retry': 'project-operator',
  'submit-task': 'project-operator',
  'approve-gate': 'project-maintainer',
  'change-settings': 'project-maintainer',
  'add-standing-rule': 'project-maintainer',
  reconcile: 'project-maintainer',
  'manage-workers': 'installation-owner',
};

export type DecisionState = { decision: InboxDecision; confirmed: boolean };

interface PocState {
  screen: Screen;
  go: (screen: Screen) => void;
  decisions: Partial<Record<InboxId, DecisionState>>;
  decide: (id: InboxId, decision: InboxDecision) => void;
  needsYouCount: number;
  persona: Persona;
  setPersona: (id: string) => void;
  can: (capability: Capability) => boolean;
  signedIn: boolean;
  signIn: () => void;
  signOut: () => void;
  cursor: number;
}

const PocContext = createContext<PocState | null>(null);
const CONFIRM_DELAY = 900;
const EVENT_INTERVAL = 3000;

function isScreen(name: string): name is Screen {
  return (SCREENS as readonly string[]).includes(name);
}

function screenFromHash(): Screen {
  const name = window.location.hash.replace('#', '');
  return isScreen(name) ? name : 'board';
}

function useEventCursor(): number {
  const [cursor, setCursor] = useState(4182);
  useEffect(() => {
    const timer = window.setInterval(() => setCursor((c) => c + 1), EVENT_INTERVAL);
    return () => clearInterval(timer);
  }, []);
  return cursor;
}

export function PocProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<Screen>(screenFromHash);
  const [decisions, setDecisions] = useState<PocState['decisions']>({});
  const [signedIn, setSignedIn] = useState(true);
  const [personaId, setPersonaId] = useState('pp');
  const timers = useRef(new Set<number>());
  const cursor = useEventCursor();
  const persona = PERSONAS.find((p) => p.id === personaId) ?? PERSONAS[0];

  useEffect(() => {
    const onHash = () => setScreen(screenFromHash());
    window.addEventListener('hashchange', onHash);
    const pending = timers.current;
    return () => {
      window.removeEventListener('hashchange', onHash);
      pending.forEach(clearTimeout);
    };
  }, []);

  const go = (next: Screen) => {
    window.location.hash = next;
    setScreen(next);
    window.scrollTo(0, 0);
  };
  const decide = (id: InboxId, decision: InboxDecision) => {
    setDecisions((current) => ({ ...current, [id]: { decision, confirmed: false } }));
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      setDecisions((current) => ({ ...current, [id]: { decision, confirmed: true } }));
    }, CONFIRM_DELAY);
    timers.current.add(timer);
  };
  const can = (capability: Capability) => persona.roles.some((role) => GRANTS[role].includes(capability));
  const needsYouCount = INBOX_IDS.filter((id) => !decisions[id]?.confirmed).length;

  return (
    <PocContext.Provider
      value={{
        screen,
        go,
        decisions,
        decide,
        needsYouCount,
        persona,
        setPersona: setPersonaId,
        can,
        signedIn,
        signIn: () => setSignedIn(true),
        signOut: () => setSignedIn(false),
        cursor,
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
