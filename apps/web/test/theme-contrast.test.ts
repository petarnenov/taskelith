import { describe, expect, it } from 'vitest';
import { theme } from '../src/theme';
import { contrastRatio, schemeColors, type Scheme, type SchemeColors } from './contrast';

const MINIMUM = 4.5;
const BODY = 'var(--mantine-color-body)';
const TEXT = 'var(--mantine-color-text)';
const DIMMED = 'var(--mantine-color-dimmed)';

// Surfaces that Mantine's stylesheets set per scheme, not its resolvers:
// Popover and Input backgrounds and the Menu item hover.
const SURFACES: Record<Scheme, { dropdown: string; input: string; menuHover: string; alertText: string }> = {
  light: {
    dropdown: 'var(--mantine-color-white)',
    input: 'var(--mantine-color-white)',
    menuHover: 'var(--mantine-color-gray-1)',
    alertText: 'var(--mantine-color-black)',
  },
  dark: {
    dropdown: 'var(--mantine-color-dark-6)',
    input: 'var(--mantine-color-dark-6)',
    menuHover: 'var(--mantine-color-dark-4)',
    alertText: 'var(--mantine-color-white)',
  },
};

// Each pair is a foreground, its background, and the page beneath both.
type Pair = readonly [name: string, foreground: string, background: string];

function shellPairs(colors: SchemeColors, scheme: Scheme): Pair[] {
  const surfaces = SURFACES[scheme];
  const variant = (name: string, kind: string, color: string): Pair => {
    const { color: foreground, background } = colors.variant(kind, color);
    return [name, foreground, background];
  };
  const alert = (color: string): Pair[] => {
    const { color: title, background } = colors.variant('light', color);
    return [
      [`${color} alert title`, title, background],
      [`${color} alert message`, surfaces.alertText, background],
    ];
  };
  return [
    ['text on the page', TEXT, BODY],
    ['dimmed text on the page', DIMMED, BODY],
    ['dimmed text on a dropdown', DIMMED, surfaces.dropdown],
    ['text on a dropdown', TEXT, surfaces.dropdown],
    ['text on a hovered menu item', TEXT, surfaces.menuHover],
    ['text in an input', TEXT, surfaces.input],
    variant('primary filled', 'filled', 'indigo'),
    variant('primary light', 'light', 'indigo'),
    variant('gray subtle', 'subtle', 'gray'),
    variant('default', 'default', 'gray'),
    ...alert('indigo'),
    ...alert('red'),
  ];
}

describe.each<Scheme>(['dark', 'light'])('the %s color scheme', (scheme) => {
  const colors = schemeColors(theme, scheme);
  const page = colors.resolve(BODY);
  it.each(shellPairs(colors, scheme))('keeps %s at 4.5:1 or more', (_, foreground, background) => {
    const ratio = contrastRatio(colors.resolve(foreground), colors.resolve(background), page);
    expect(ratio).toBeGreaterThanOrEqual(MINIMUM);
  });
});

describe('contrastRatio', () => {
  it('measures black on white as 21:1 and a color on itself as 1:1', () => {
    expect(contrastRatio('#000', '#fff', '#fff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#6c757d', '#6c757d', '#fff')).toBeCloseTo(1, 5);
  });

  it('blends a translucent background over the page', () => {
    expect(contrastRatio('#000000', 'rgba(255, 255, 255, 0)', '#000')).toBeCloseTo(1, 5);
    expect(contrastRatio('#fff', 'transparent', '#000')).toBeCloseTo(21, 5);
  });

  it('fails Mantine default dimmed text, which the theme corrects', () => {
    const defaults = schemeColors({}, 'light');
    const ratio = contrastRatio(defaults.resolve(DIMMED), defaults.resolve(BODY), '#fff');
    expect(ratio).toBeLessThan(MINIMUM);
  });

  it('refuses an unknown variable and an unsupported color', () => {
    const colors = schemeColors(theme, 'dark');
    expect(() => colors.resolve('var(--taskelith-unknown)')).toThrow('Unknown CSS variable');
    expect(() => contrastRatio('hsl(0 0% 0%)', '#fff', '#fff')).toThrow('Unsupported color');
  });
});
