import type { RouteObject } from 'react-router';
import { NotFoundPage, PlannedPage } from './pages';
import { SCREENS, type PlannedScreen } from './screens';
import { Shell } from './shell/Shell';

// The SPA's base path, as in vite.config.ts; route paths sit below it.
export const APP_BASENAME = '/app';

export function appRoutes(): RouteObject[] {
  return [
    {
      path: '/',
      element: <Shell />,
      children: [...SCREENS.map(screenRoute), { path: '*', element: <NotFoundPage /> }],
    },
  ];
}

function screenRoute(screen: PlannedScreen): RouteObject {
  const element = <PlannedPage screen={screen} />;
  return screen.path === '/' ? { index: true, element } : { path: screen.path, element };
}
