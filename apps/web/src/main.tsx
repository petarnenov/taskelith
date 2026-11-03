import '@mantine/core/styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { App } from './App';
import { createBoardGateway } from './board/control-plane-board';
import { APP_BASENAME, appRoutes } from './routes';
import { browserClock } from './session/clock';
import { createSessionGateway } from './session/control-plane-session';
import { pageStyleNonce } from './style-nonce';

const root = document.getElementById('root');
if (root === null) throw new Error('The page has no #root element.');
const router = createBrowserRouter(appRoutes(), { basename: APP_BASENAME });
createRoot(root).render(
  <StrictMode>
    <App
      router={router}
      gateway={createSessionGateway()}
      board={createBoardGateway()}
      clock={browserClock}
      styleNonce={pageStyleNonce(document)}
    />
  </StrictMode>,
);
