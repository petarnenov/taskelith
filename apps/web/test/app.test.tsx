import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.resetModules();
});

describe('App', () => {
  it('names the scaffold honestly, without screens it does not have', () => {
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Taskelith' })).toBeDefined();
    expect(screen.getByRole('main').textContent).toContain('scaffold');
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('uses the dark color scheme by default', () => {
    render(<App />);
    expect(document.documentElement.getAttribute('data-mantine-color-scheme')).toBe('dark');
  });
});

describe('main', () => {
  it('renders the application into #root', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    await import('../src/main');
    expect(await screen.findByRole('heading', { name: 'Taskelith' })).toBeDefined();
  });

  it('fails clearly without a #root element', async () => {
    await expect(import('../src/main')).rejects.toThrow('The page has no #root element.');
  });
});
