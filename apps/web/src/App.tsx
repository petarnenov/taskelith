import { localStorageColorSchemeManager, MantineProvider } from '@mantine/core';
import { RouterProvider, type createBrowserRouter } from 'react-router';
import type { TurnRecordStore } from './agent-session/turn-records';
import { TurnRecordsProvider } from './agent-session/TurnRecordsProvider';
import type { BoardGateway } from './board/board';
import { BoardServicesProvider } from './board/BoardServices';
import type { Clock } from './session/clock';
import type { SessionGateway } from './session/session';
import { SessionProvider } from './session/SessionProvider';
import { cssVariablesResolver, theme } from './theme';

// The browser keeps the operator's color scheme choice under this key.
export const COLOR_SCHEME_KEY = 'taskelith-color-scheme';
const colorSchemeManager = localStorageColorSchemeManager({ key: COLOR_SCHEME_KEY });

export interface AppProps {
  readonly router: ReturnType<typeof createBrowserRouter>;
  readonly gateway: SessionGateway;
  readonly board: BoardGateway;
  readonly turnRecords: TurnRecordStore;
  readonly clock: Clock;
  // The page's CSP nonce, which every style element of Mantine carries.
  readonly styleNonce?: string;
}

export function App({ router, gateway, board, turnRecords, clock, styleNonce }: AppProps) {
  const getStyleNonce = styleNonce === undefined ? undefined : () => styleNonce;
  return (
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      defaultColorScheme="dark"
      colorSchemeManager={colorSchemeManager}
      getStyleNonce={getStyleNonce}
    >
      <SessionProvider gateway={gateway} clock={clock}>
        <BoardServicesProvider gateway={board} clock={clock}>
          <TurnRecordsProvider store={turnRecords}>
            <RouterProvider router={router} />
          </TurnRecordsProvider>
        </BoardServicesProvider>
      </SessionProvider>
    </MantineProvider>
  );
}
