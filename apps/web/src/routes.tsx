import type { RouteObject } from 'react-router';
import { SessionPage } from './agent-session/SessionPage';
import { SessionsIndexPage } from './agent-session/SessionsIndexPage';
import { BoardPage } from './board/BoardPage';
import { TaskDetailRoute } from './board/TaskDetailDrawer';
import { NotFoundPage, PlannedPage } from './pages';
import { AGENT_SESSION, PLANNED_SCREENS, SESSIONS, TASK_DETAIL, WORKERS, type PlannedScreen } from './screens';
import { Shell } from './shell/Shell';
import { WorkersPage } from './workers/WorkersPage';

// The SPA's base path, as in vite.config.ts; route paths sit below it.
export const APP_BASENAME = '/app';

// The board stays mounted under the task detail, which opens over it.
export function appRoutes(): RouteObject[] {
  return [
    {
      path: '/',
      element: <Shell />,
      children: [
        {
          element: <BoardPage />,
          children: [{ index: true }, { path: TASK_DETAIL.path, element: <TaskDetailRoute /> }],
        },
        { path: SESSIONS.path, element: <SessionsIndexPage /> },
        { path: AGENT_SESSION.path, element: <SessionPage /> },
        { path: WORKERS.path, element: <WorkersPage /> },
        ...PLANNED_SCREENS.map(screenRoute),
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ];
}

function screenRoute(screen: PlannedScreen): RouteObject {
  return { path: screen.path, element: <PlannedPage screen={screen} /> };
}
