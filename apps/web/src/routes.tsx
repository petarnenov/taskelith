import type { RouteObject } from 'react-router';
import { BoardPage } from './board/BoardPage';
import { NotFoundPage, PlannedPage } from './pages';
import { PLANNED_SCREENS, type PlannedScreen } from './screens';
import { Shell } from './shell/Shell';

// The SPA's base path, as in vite.config.ts; route paths sit below it.
export const APP_BASENAME = '/app';

export function appRoutes(): RouteObject[] {
  return [
    {
      path: '/',
      element: <Shell />,
      children: [
        { index: true, element: <BoardPage /> },
        ...PLANNED_SCREENS.map(screenRoute),
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ];
}

function screenRoute(screen: PlannedScreen): RouteObject {
  return { path: screen.path, element: <PlannedPage screen={screen} /> };
}
