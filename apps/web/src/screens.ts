// The screens of G3 decision D10 that the shell routes to, each with the G3
// item and change that build it; until then its page shows no data.

export interface PlannedScreen {
  readonly path: string;
  readonly label: string;
  readonly title: string;
  readonly item: number;
  readonly change: string;
}

export const BOARD: PlannedScreen = {
  path: '/',
  label: 'Board',
  title: 'Project board',
  item: 29,
  change: 'build-board-view',
};

// The task detail of a card, a Drawer over the board; it is not in the
// navigation, and its address names the project and the card's run.
export const TASK_DETAIL: PlannedScreen = {
  path: '/projects/:projectId/cards/:runId',
  label: 'Task detail',
  title: 'Task detail',
  item: 29,
  change: 'build-task-detail',
};

export function taskDetailPath(projectId: string, runId: string): string {
  return `/projects/${routeSegment(projectId)}/cards/${routeSegment(runId)}`;
}

// An agent session, linked from its task in the task detail; it is not in
// the navigation, and its address names the project and the session.
export const AGENT_SESSION: PlannedScreen = {
  path: '/sessions/:projectId/:sessionId',
  label: 'Agent session',
  title: 'Agent session',
  item: 31,
  change: 'build-agent-session-timeline',
};

export function sessionPath(projectId: string, sessionId: string): string {
  return `/sessions/${routeSegment(projectId)}/${routeSegment(sessionId)}`;
}

// The SPA's server answers 404 for a dot in the last segment or a decoded
// separator, so each other character is written as ~ and two hex digits.
function routeSegment(identifier: string): string {
  return identifier.replace(/[^A-Za-z0-9_-]/g, (character) => `~${hex(character)}`);
}

export function identifierOf(segment: string): string {
  return segment.replace(/~([0-9A-F]{2})/g, (_escape, code: string) => String.fromCharCode(Number.parseInt(code, 16)));
}

function hex(character: string): string {
  return character.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
}

// The navigation's entry: a page that says where sessions open from.
export const SESSIONS: PlannedScreen = {
  path: '/sessions',
  label: 'Sessions',
  title: 'Agent sessions',
  item: 31,
  change: 'build-agent-session-timeline',
};

const REVIEWS: PlannedScreen = {
  path: '/reviews',
  label: 'Reviews',
  title: 'Reviews',
  item: 34,
  change: 'build-reviews-and-settings-screens',
};

// The workers of the installation; 33b and 33c add the enrollment tokens
// and the account pools below them.
export const WORKERS: PlannedScreen = {
  path: '/workers',
  label: 'Workers',
  title: 'Workers and account pools',
  item: 33,
  change: 'build-workers-screen',
};

const INTEGRATIONS: PlannedScreen = {
  path: '/integrations',
  label: 'Integrations',
  title: 'SCM integrations',
  item: 34,
  change: 'build-reviews-and-settings-screens',
};

const PLUGINS: PlannedScreen = {
  path: '/plugins',
  label: 'Plugins',
  title: 'Plugins',
  item: 34,
  change: 'build-reviews-and-settings-screens',
};

export const NEW_TASK: PlannedScreen = {
  path: '/new-task',
  label: 'New task',
  title: 'New task',
  item: 30,
  change: 'build-new-task-screen',
};

export const NEEDS_YOU: PlannedScreen = {
  path: '/inbox',
  label: 'Needs you',
  title: 'Needs you',
  item: 32,
  change: 'build-needs-you-inbox',
};

export const MAIN_NAVIGATION: readonly PlannedScreen[] = [BOARD, SESSIONS, REVIEWS, WORKERS, INTEGRATIONS, PLUGINS];

export const SCREENS: readonly PlannedScreen[] = [...MAIN_NAVIGATION, NEW_TASK, NEEDS_YOU];

// The routed screens whose page is still the empty planned page.
const BUILT_SCREENS: readonly PlannedScreen[] = [BOARD, SESSIONS, WORKERS];
export const PLANNED_SCREENS: readonly PlannedScreen[] = SCREENS.filter((screen) => !BUILT_SCREENS.includes(screen));
