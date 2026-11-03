import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Project } from './board';
import { useBoardServices } from './BoardServices';

// The browser keeps the operator's last chosen project under this key.
export const PROJECT_KEY = 'taskelith-project';

export type ProjectsView =
  | { readonly status: 'loading' }
  | { readonly status: 'unavailable' }
  | { readonly status: 'listed'; readonly projects: readonly Project[]; readonly selected?: Project };

export interface Projects {
  readonly view: ProjectsView;
  readonly select: (projectId: string) => void;
  readonly retry: () => void;
}

const ProjectsContext = createContext<Projects | undefined>(undefined);

export function useProjects(): Projects {
  const projects = useContext(ProjectsContext);
  if (projects === undefined) throw new Error('useProjects needs a ProjectsProvider.');
  return projects;
}

type Listing = { readonly status: 'loading' | 'unavailable' } | { readonly status: 'listed'; readonly projects: readonly Project[] };

// Lists the projects the operator holds a role on, every one for an
// installation-owner; the chosen one stays chosen in this browser.
export function ProjectsProvider({ children }: { readonly children: ReactNode }) {
  const { gateway } = useBoardServices();
  const [listing, setListing] = useState<Listing>({ status: 'loading' });
  const [lists, setLists] = useState(0);
  const [chosen, setChosen] = useState(readChoice);

  useEffect(() => {
    let current = true;
    void gateway.listProjects().then((result) => {
      if (!current) return;
      setListing(result.kind === 'read' ? { status: 'listed', projects: result.value } : { status: 'unavailable' });
    });
    return () => {
      current = false;
    };
  }, [gateway, lists]);

  const select = useCallback((projectId: string) => {
    setChosen(projectId);
    writeChoice(projectId);
  }, []);

  const retry = useCallback(() => {
    setListing({ status: 'loading' });
    setLists((count) => count + 1);
  }, []);

  const value = useMemo(() => ({ view: viewOf(listing, chosen), select, retry }), [listing, chosen, select, retry]);
  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

function viewOf(listing: Listing, chosen: string | undefined): ProjectsView {
  if (listing.status !== 'listed') return listing;
  const { projects } = listing;
  const selected = projects.find((project) => project.projectId === chosen) ?? projects[0];
  return selected === undefined ? { status: 'listed', projects } : { status: 'listed', projects, selected };
}

// Storage may be blocked or empty, so the choice is only a convenience.
function readChoice(): string | undefined {
  try {
    return localStorage.getItem(PROJECT_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function writeChoice(projectId: string): void {
  try {
    localStorage.setItem(PROJECT_KEY, projectId);
  } catch {
    // The choice then lasts only until the page is reloaded.
  }
}
