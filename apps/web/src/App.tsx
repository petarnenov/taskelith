import { localStorageColorSchemeManager, MantineProvider } from '@mantine/core';
import { RouterProvider, type createBrowserRouter } from 'react-router';
import type { Clock } from './session/clock';
import type { SessionGateway } from './session/session';
import { SessionProvider } from './session/SessionProvider';
import { theme } from './theme';

// The browser keeps the operator's color scheme choice under this key.
export const COLOR_SCHEME_KEY = 'taskelith-color-scheme';
const colorSchemeManager = localStorageColorSchemeManager({ key: COLOR_SCHEME_KEY });

export interface AppProps {
  readonly router: ReturnType<typeof createBrowserRouter>;
  readonly gateway: SessionGateway;
  readonly clock: Clock;
}

export function App({ router, gateway, clock }: AppProps) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark" colorSchemeManager={colorSchemeManager}>
      <SessionProvider gateway={gateway} clock={clock}>
        <RouterProvider router={router} />
      </SessionProvider>
    </MantineProvider>
  );
}
