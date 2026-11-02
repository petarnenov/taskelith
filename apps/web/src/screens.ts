// The screens of G3 decision D10 that the shell routes to, each with the G3
// item that builds it; until then its page is empty and shows no data.

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
  change: 'build-board-and-task-detail',
};

const SESSIONS: PlannedScreen = {
  path: '/sessions',
  label: 'Sessions',
  title: 'Agent sessions',
  item: 31,
  change: 'build-agent-session-screen',
};

const REVIEWS: PlannedScreen = {
  path: '/reviews',
  label: 'Reviews',
  title: 'Reviews',
  item: 34,
  change: 'build-reviews-and-settings-screens',
};

const WORKERS: PlannedScreen = {
  path: '/workers',
  label: 'Workers',
  title: 'Workers and account pools',
  item: 33,
  change: 'build-workers-and-pools-screens',
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
