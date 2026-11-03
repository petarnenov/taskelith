import { cleanup, render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { APP_BASENAME, appRoutes } from '../src/routes';
import { pageStyleNonce } from '../src/style-nonce';
import { AUTHENTICATED, fakeGateway, ManualClock } from './fakes';

afterEach(cleanup);

function pageWith(nonce: string | undefined): Document {
  const page = document.implementation.createHTMLDocument('page');
  if (nonce === undefined) return page;
  const meta = page.createElement('meta');
  meta.setAttribute('property', 'csp-nonce');
  meta.setAttribute('nonce', nonce);
  page.head.append(meta);
  return page;
}

describe('the style nonce', () => {
  it('is read from the csp-nonce meta tag of the page', () => {
    expect(pageStyleNonce(pageWith('bm9uY2U='))).toBe('bm9uY2U=');
  });

  it('is undefined without the tag or with an empty nonce', () => {
    expect(pageStyleNonce(pageWith(undefined))).toBeUndefined();
    expect(pageStyleNonce(pageWith(''))).toBeUndefined();
  });

  it('reaches every style element that Mantine adds', async () => {
    const router = createMemoryRouter(appRoutes(), { basename: APP_BASENAME, initialEntries: ['/app/'] });
    render(<App router={router} gateway={fakeGateway(AUTHENTICATED)} clock={new ManualClock()} styleNonce="bm9uY2U=" />);
    await screen.findAllByRole('link', { name: /board/i });
    const styles = [...document.querySelectorAll('style[data-mantine-styles]')];
    expect(styles.length).toBeGreaterThan(0);
    for (const style of styles) expect(style.getAttribute('nonce')).toBe('bm9uY2U=');
  });
});
