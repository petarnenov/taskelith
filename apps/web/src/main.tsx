import '@mantine/core/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { createTurnRecordStore } from './agent-session/turn-records';
import { App } from './App';
import { createBoardGateway } from './board/control-plane-board';
import { APP_BASENAME, appRoutes } from './routes';
import { browserClock } from './session/clock';
import { createSessionGateway } from './session/control-plane-session';
import { pageStyleNonce } from './style-nonce';
import { createWorkersGateway } from './workers/control-plane-workers';

const root = document.getElementById('root');
if (root === null) throw new Error('The page has no #root element.');
const router = createBrowserRouter(appRoutes(), { basename: APP_BASENAME });
// The board gateway reads the session's CSRF token through the getter alone.
const session = createSessionGateway();
createRoot(root).render(
  <StrictMode>
    <App
      router={router}
      gateway={session}
      board={createBoardGateway({ csrfToken: session.csrfToken })}
      workers={createWorkersGateway()}
      turnRecords={createTurnRecordStore()}
      clock={browserClock}
      styleNonce={pageStyleNonce(document)}
    />
  </StrictMode>,
);
