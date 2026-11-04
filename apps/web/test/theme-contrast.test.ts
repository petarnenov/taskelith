import { describe, expect, it } from 'vitest';
import { cssVariablesResolver, theme } from '../src/theme';
import { contrastRatio, schemeColors, type Scheme, type SchemeColors } from './contrast';

const MINIMUM = 4.5;
const BODY = 'var(--mantine-color-body)';
const TEXT = 'var(--mantine-color-text)';
const DIMMED = 'var(--mantine-color-dimmed)';
const ANCHOR = 'var(--mantine-color-anchor)';
// Input.error text and an erroneous input's own text (Input.css [data-error]).
const ERROR = 'var(--mantine-color-error)';

// Surfaces that Mantine's stylesheets set per scheme, not its resolvers:
// Popover, Input, Card, and dot Badge backgrounds, and the hovers.
interface Surfaces {
  readonly dropdown: string;
  readonly input: string;
  readonly menuHover: string;
  readonly navLinkHover: string;
  readonly alertText: string;
  readonly card: string;
  readonly dotBadge: string;
  readonly dotBadgeText: string;
}

const SURFACES: Record<Scheme, Surfaces> = {
  light: {
    dropdown: 'var(--mantine-color-white)',
    input: 'var(--mantine-color-white)',
    menuHover: 'var(--mantine-color-gray-1)',
    navLinkHover: 'var(--mantine-color-gray-0)',
    alertText: 'var(--mantine-color-black)',
    card: 'var(--mantine-color-white)',
    dotBadge: 'var(--mantine-color-white)',
    dotBadgeText: 'var(--mantine-color-black)',
  },
  dark: {
    dropdown: 'var(--mantine-color-dark-6)',
    input: 'var(--mantine-color-dark-6)',
    menuHover: 'var(--mantine-color-dark-4)',
    navLinkHover: 'var(--mantine-color-dark-6)',
    alertText: 'var(--mantine-color-white)',
    card: 'var(--mantine-color-dark-6)',
    dotBadge: 'var(--mantine-color-dark-5)',
    dotBadgeText: 'var(--mantine-color-white)',
  },
};

// Each pair is a foreground, its background, and the page beneath both.
type Pair = readonly [name: string, foreground: string, background: string];

function screenPairs(colors: SchemeColors, scheme: Scheme): Pair[] {
  const surfaces = SURFACES[scheme];
  const variant = (name: string, kind: string, color: string): Pair[] => {
    const { color: foreground, background, hover, hoverColor } = colors.variant(kind, color);
    return [
      [name, foreground, background],
      [`hovered ${name}`, hoverColor, hover],
    ];
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
    ['error text under an input, on the page', ERROR, BODY],
    ['text in an erroneous input', ERROR, surfaces.input],
    ['text on a hovered navigation link', TEXT, surfaces.navLinkHover],
    ...variant('primary filled', 'filled', 'indigo'),
    ...variant('primary light', 'light', 'indigo'),
    ...variant('gray subtle', 'subtle', 'gray'),
    ...variant('default', 'default', 'gray'),
    ...alert('indigo'),
    ...alert('red'),
    ...alert('gray'),
    ['text on a board card', TEXT, surfaces.card],
    ['dimmed text on a board card', DIMMED, surfaces.card],
    ['text of a dot badge', surfaces.dotBadgeText, surfaces.dotBadge],
    ['a failed self-check on a worker card', ERROR, surfaces.card],
    ['a card title link on a board card', ANCHOR, surfaces.card],
    ['a link on the page', ANCHOR, BODY],
  ];
}

describe.each<Scheme>(['dark', 'light'])('the %s color scheme', (scheme) => {
  const colors = schemeColors(theme, scheme, cssVariablesResolver);
  const page = colors.resolve(BODY);
  it.each(screenPairs(colors, scheme))('keeps %s at 4.5:1 or more', (_, foreground, background) => {
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

  it.each<Scheme>(['light', 'dark'])('fails Mantine default error text in the %s scheme, which the theme corrects', (scheme) => {
    const defaults = schemeColors({}, scheme);
    const page = defaults.resolve(BODY);
    expect(contrastRatio(defaults.resolve(ERROR), page, page)).toBeLessThan(MINIMUM);
    expect(contrastRatio(defaults.resolve(ERROR), defaults.resolve(SURFACES[scheme].input), page)).toBeLessThan(MINIMUM);
  });

  it('refuses an unknown variable and an unsupported color', () => {
    const colors = schemeColors(theme, 'dark');
    expect(() => colors.resolve('var(--taskelith-unknown)')).toThrow('Unknown CSS variable');
    expect(() => contrastRatio('hsl(0 0% 0%)', '#fff', '#fff')).toThrow('Unsupported color');
  });
});
