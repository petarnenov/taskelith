import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { CheckIcon, ChevronIcon, InboxIcon, LogoIcon, MoonIcon, PlusIcon, SunIcon } from '../src/icons';
import { MAIN_NAVIGATION, SCREENS } from '../src/screens';
import { TARGET_SIZE, theme } from '../src/theme';
import { renderApp } from './fakes';

afterEach(cleanup);

const HEADER_NAVIGATION = 'Main';
const NAVBAR_NAVIGATION = 'Main menu';

function navigation(name: string) {
  return within(screen.getByRole('navigation', { name }));
}

describe('the routes', () => {
  it.each(SCREENS.map((planned) => [planned.path, planned] as const))(
    'shows an empty page at /app%s that names the item that builds it',
    async (path, planned) => {
      renderApp(`/app${path}`);
      expect(await screen.findByRole('heading', { level: 1, name: planned.title })).toBeDefined();
      const main = screen.getByRole('main');
      expect(main.textContent).toContain(`G3 item ${planned.item}, ${planned.change}, builds this screen`);
      expect(main.textContent).toContain('it shows no data');
    },
  );

  it('shows a not-found page for an unknown address and leads back to the board', async () => {
    renderApp('/app/knowledge');
    expect(await screen.findByRole('heading', { level: 1, name: 'Page not found' })).toBeDefined();
    await userEvent.click(screen.getByRole('link', { name: 'Go to the board' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Project board' })).toBeDefined();
  });
});

describe('the navigation', () => {
  it('lists the D10 screens and no screen of a later gate', async () => {
    renderApp('/app/');
    await screen.findByRole('heading', { level: 1, name: 'Project board' });
    for (const name of [HEADER_NAVIGATION, NAVBAR_NAVIGATION]) {
      const links = navigation(name).getAllByRole('link');
      expect(links.map((link) => link.textContent)).toEqual(['Board', 'Sessions', 'Reviews', 'Workers', 'Integrations', 'Plugins']);
      expect(links.map((link) => link.getAttribute('href'))).toEqual(MAIN_NAVIGATION.map((planned) => `/app${planned.path}`.replace(/\/$/, '')));
    }
    expect(screen.queryByText(/Knowledge|Board states|Framework/)).toBeNull();
  });

  it('marks the current screen in both navigations', async () => {
    renderApp('/app/plugins');
    await screen.findByRole('heading', { level: 1, name: 'Plugins' });
    for (const name of [HEADER_NAVIGATION, NAVBAR_NAVIGATION]) {
      const current = navigation(name).getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page');
      expect(current.map((link) => link.textContent)).toEqual(['Plugins']);
    }
  });

  it('moves between screens from the header', async () => {
    renderApp('/app/');
    const user = userEvent.setup();
    await screen.findByRole('heading', { level: 1, name: 'Project board' });
    await user.click(navigation(HEADER_NAVIGATION).getByRole('link', { name: 'Sessions' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Agent sessions' })).toBeDefined();
    await user.click(screen.getByRole('link', { name: 'New task' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'New task' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'New task' }).getAttribute('aria-current')).toBe('page');
    await user.click(screen.getByRole('link', { name: 'Needs you' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Needs you' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Needs you' }).getAttribute('aria-current')).toBe('page');
  });

  it('opens the navbar with the burger and closes it after a choice', async () => {
    renderApp('/app/');
    const user = userEvent.setup();
    const burger = await screen.findByRole('button', { name: 'Toggle navigation' });
    await user.click(burger);
    expect(burger.getAttribute('aria-expanded')).toBe('true');
    await user.click(navigation(NAVBAR_NAVIGATION).getByRole('link', { name: 'Workers' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Workers and account pools' })).toBeDefined();
    expect(burger.getAttribute('aria-expanded')).toBe('false');
  });
});

// Coordinator decision D4: a control is focusable and named; a badge never
// counts as a target.
describe('interactive controls', () => {
  it('are focusable and named, and no badge is interactive', async () => {
    renderApp('/app/');
    await screen.findByRole('heading', { level: 1, name: 'Project board' });
    const controls = [...screen.getAllByRole('button'), ...screen.getAllByRole('link')];
    for (const control of controls) {
      expect(control.tabIndex).toBeGreaterThanOrEqual(0);
      expect(control.getAttribute('aria-label') ?? control.textContent).not.toBe('');
    }
    for (const badge of document.querySelectorAll('.mantine-Badge-root')) {
      expect(badge.closest('a, button, [tabindex]')).toBeNull();
    }
  });

  it('get the 44 px target size through the theme defaults', () => {
    const components = theme.components ?? {};
    const defaults = (name: string) => (components[name]?.defaultProps ?? {}) as Record<string, unknown>;
    for (const name of ['Button', 'MenuItem', 'NavLink']) expect(defaults(name)['mih']).toBe(TARGET_SIZE);
    for (const name of ['ActionIcon', 'CloseButton']) expect(defaults(name)['size']).toBe('xl');
    expect(defaults('Burger')['size']).toBe('lg');
  });
});

describe('the icons', () => {
  it('keeps the seven icons of the proof of concept, hidden from assistive technology', () => {
    const icons = [LogoIcon, SunIcon, MoonIcon, InboxIcon, PlusIcon, CheckIcon, ChevronIcon];
    const { container } = render(
      <>
        {icons.map((Icon) => (
          <Icon key={Icon.name} />
        ))}
      </>,
    );
    const svgs = [...container.querySelectorAll('svg')];
    expect(svgs).toHaveLength(7);
    for (const svg of svgs) expect(svg.getAttribute('aria-hidden')).toBe('true');
  });
});
