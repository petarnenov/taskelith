import {
  ActionIcon,
  Anchor,
  Breadcrumbs,
  Burger,
  Button,
  CloseButton,
  Menu,
  NavLink,
  PasswordInput,
  SegmentedControl,
  Text,
  Textarea,
  TextInput,
  createTheme,
  darken,
  luminance,
  rem,
  type CSSVariablesResolver,
  type MantineColorsTuple,
  type MantineTheme,
} from '@mantine/core';
import { TARGET_SIZE } from './ui';

// The product UI design rules require text contrast of at least 4.5:1.
const MIN_CONTRAST = 4.5;
const DARKEN_STEP = 0.05;
// Above this luminance black text contrasts more than white; both are 4.58:1.
const EQUAL_CONTRAST_LUMINANCE = 0.179;

// Mantine 9.7.3's default segment padding above and below the label.
const SEGMENT_PADDING_Y = 3;
const SEGMENT_LINE_HEIGHT = TARGET_SIZE - 2 * SEGMENT_PADDING_Y;

export const theme = createTheme({
  primaryColor: 'indigo',
  primaryShade: 7,
  autoContrast: true,
  luminanceThreshold: EQUAL_CONTRAST_LUMINANCE,
  respectReducedMotion: true,
  defaultRadius: 'md',
  fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
  fontFamilyMonospace: "'IBM Plex Mono', ui-monospace, monospace",
  headings: { fontFamily: "'IBM Plex Sans', system-ui, sans-serif", fontWeight: '600' },
  components: {
    ActionIcon: ActionIcon.extend({ defaultProps: { size: 'xl' } }),
    Anchor: Anchor.extend({
      defaultProps: { display: 'inline-block', miw: TARGET_SIZE, lh: rem(TARGET_SIZE) },
    }),
    Breadcrumbs: Breadcrumbs.extend({
      defaultProps: {
        separator: (
          <Text span c="dimmed">
            /
          </Text>
        ),
      },
    }),
    Burger: Burger.extend({ defaultProps: { size: 'lg' } }),
    Button: Button.extend({ defaultProps: { mih: TARGET_SIZE } }),
    CloseButton: CloseButton.extend({ defaultProps: { size: 'xl' } }),
    MenuItem: Menu.Item.extend({ defaultProps: { mih: TARGET_SIZE } }),
    NavLink: NavLink.extend({ defaultProps: { mih: TARGET_SIZE } }),
    PasswordInput: PasswordInput.extend({
      defaultProps: { size: 'lg', visibilityToggleButtonProps: { miw: TARGET_SIZE, mih: TARGET_SIZE } },
    }),
    SegmentedControl: SegmentedControl.extend({ defaultProps: { lh: rem(SEGMENT_LINE_HEIGHT) } }),
    TextInput: TextInput.extend({ defaultProps: { size: 'lg' } }),
    Textarea: Textarea.extend({ defaultProps: { size: 'lg' } }),
  },
});

function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

// The lightest of shades 6 to 9 that reaches 4.5:1 on shade 2, the light
// variant's hover; otherwise shade 9 darkened until it does.
function inkOf(shades: MantineColorsTuple): string {
  const readable = (color: string) => contrast(color, shades[2]) >= MIN_CONTRAST;
  const shade = shades.slice(6).find(readable);
  if (shade) return shade;
  let ink = shades[9];
  for (let amount = DARKEN_STEP; !readable(ink) && amount < 1; amount += DARKEN_STEP) {
    ink = darken(shades[9], amount);
  }
  return ink;
}

function lightSchemeInks(theme: MantineTheme): Record<string, string> {
  return Object.fromEntries(
    Object.entries(theme.colors).flatMap(([name, shades]) => {
      const ink = inkOf(shades);
      return ['text', 'light-color', 'outline'].map((role) => [`--mantine-color-${name}-${role}`, ink]);
    }),
  );
}

// Text Mantine shows in the dimmed color must reach 4.5:1 as dimmed does.
const DIMMED_TEXT = {
  '--mantine-color-placeholder': 'var(--mantine-color-dimmed)',
  '--mantine-color-disabled-color': 'var(--mantine-color-dimmed)',
  '--mantine-color-error': 'var(--mantine-color-red-text)',
};

// Mantine's dimmed gray.6 and dark.2 fall below 4.5:1 on their surfaces.
export const resolveCssVariables: CSSVariablesResolver = (current) => ({
  variables: {},
  light: {
    ...lightSchemeInks(current),
    ...DIMMED_TEXT,
    '--mantine-color-dimmed': 'var(--mantine-color-gray-7)',
  },
  dark: { ...DIMMED_TEXT, '--mantine-color-dimmed': 'var(--mantine-color-dark-1)' },
});
