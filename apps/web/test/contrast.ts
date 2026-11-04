import {
  defaultCssVariablesResolver,
  defaultVariantColorsResolver,
  DEFAULT_THEME,
  mergeMantineTheme,
  type CSSVariablesResolver,
  type MantineColor,
  type MantineThemeOverride,
} from '@mantine/core';

// WCAG 2.2 contrast of the colors that Mantine's own resolvers derive from
// a theme, so the test measures what Mantine renders.

export type Scheme = 'light' | 'dark';
type Variables = Readonly<Record<string, string>>;

interface Rgba {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

// The rest and hover colors of a component variant; Mantine keeps the
// text color on hover unless the resolver names a hover color.
export interface VariantColors {
  readonly background: string;
  readonly color: string;
  readonly hover: string;
  readonly hoverColor: string;
}

export interface SchemeColors {
  readonly resolve: (value: string) => string;
  readonly variant: (variant: string, color: MantineColor) => VariantColors;
}

// The provider's resolver overrides the default one's variables, as
// MantineProvider merges them.
export function schemeColors(override: MantineThemeOverride, scheme: Scheme, resolver?: CSSVariablesResolver): SchemeColors {
  const theme = mergeMantineTheme(DEFAULT_THEME, override);
  const resolved = defaultCssVariablesResolver(theme);
  const overrides = resolver?.(theme) ?? { variables: {}, light: {}, dark: {} };
  const variables: Variables = { ...resolved.variables, ...overrides.variables, ...resolved[scheme], ...overrides[scheme] };
  return {
    resolve: (value) => resolveVariable(variables, value),
    variant: (variant, color) => {
      const colors = defaultVariantColorsResolver({ color, theme, variant });
      const hoverColor = colors.hoverColor ?? colors.color;
      return { background: colors.background, color: colors.color, hover: colors.hover, hoverColor };
    },
  };
}

export function contrastRatio(foreground: string, background: string, page: string): number {
  const base = parseColor(page);
  const under = over(parseColor(background), base);
  const top = over(parseColor(foreground), under);
  const [lighter, darker] = [luminance(top), luminance(under)].sort((x, y) => y - x) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

function resolveVariable(variables: Variables, value: string): string {
  const reference = /^var\((--[\w-]+)\)$/.exec(value.trim());
  if (reference === null) return value;
  const next = variables[reference[1]!];
  if (next === undefined) throw new Error(`Unknown CSS variable ${reference[1]}`);
  return resolveVariable(variables, next);
}

function parseColor(text: string): Rgba {
  if (text === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex !== null) return parseHex(hex[1]!);
  const rgba = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(text);
  if (rgba === null) throw new Error(`Unsupported color ${text}`);
  const [r, g, b] = [rgba[1], rgba[2], rgba[3]].map(Number) as [number, number, number];
  return { r, g, b, a: rgba[4] === undefined ? 1 : Number(rgba[4]) };
}

function parseHex(digits: string): Rgba {
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join('') : digits;
  const channel = (at: number) => parseInt(full.slice(at, at + 2), 16);
  return { r: channel(0), g: channel(2), b: channel(4), a: 1 };
}

function over(top: Rgba, under: Rgba): Rgba {
  const mix = (front: number, back: number) => front * top.a + back * (1 - top.a);
  return { r: mix(top.r, under.r), g: mix(top.g, under.g), b: mix(top.b, under.b), a: 1 };
}

function luminance({ r, g, b }: Rgba): number {
  const linear = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}
