import {
  ActionIcon,
  Anchor,
  Burger,
  Button,
  CloseButton,
  createTheme,
  DEFAULT_THEME,
  Menu,
  NavLink,
  PasswordInput,
  rem,
  SegmentedControl,
  Textarea,
  TextInput,
  type CSSVariablesResolver,
  type MantineColorsTuple,
} from '@mantine/core';

// The product UI design rules require interactive targets of at least 44 px.
export const TARGET_SIZE = 44;

// Mantine 9.7.4's default segment padding above and below the label.
const SEGMENT_PADDING_Y = 3;
const SEGMENT_LINE_HEIGHT = TARGET_SIZE - 2 * SEGMENT_PADDING_Y;

// Dimmed text is gray.6 in the light scheme and dark.2 in the dark one;
// these shades lift it to 4.5:1 on every surface the shell draws.
const gray = withShade(DEFAULT_THEME.colors.gray, 6, '#6c757d');
const dark = withShade(DEFAULT_THEME.colors.dark, 2, '#999999');
// indigo.2 is the light scheme's hovered light variant behind indigo.9.
const indigo = withShade(DEFAULT_THEME.colors.indigo, 2, '#c8d3ff');
// red.9 is the light scheme's light variant text and its error color, 3.8:1
// on the hovered red.2; this shade keeps a red button readable when hovered.
const red = withShade(DEFAULT_THEME.colors.red, 9, '#b02020');

export const theme = createTheme({
  primaryColor: 'indigo',
  primaryShade: { light: 7, dark: 8 },
  respectReducedMotion: true,
  defaultRadius: 'md',
  colors: { gray, dark, indigo, red },
  components: {
    ActionIcon: ActionIcon.extend({ defaultProps: { size: 'xl' } }),
    Anchor: Anchor.extend({
      defaultProps: { display: 'inline-block', miw: TARGET_SIZE, lh: rem(TARGET_SIZE) },
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

// Mantine's error color is red.6 in the light scheme and red.8 in the dark
// one, 3.3:1 and 3.4:1 on the page; these shades reach 4.5:1 on an input too.
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: { '--mantine-color-error': 'var(--mantine-color-red-9)' },
  dark: { '--mantine-color-error': 'var(--mantine-color-red-5)' },
});

function withShade(tuple: MantineColorsTuple, index: number, shade: string): MantineColorsTuple {
  return tuple.map((value, at) => (at === index ? shade : value)) as unknown as MantineColorsTuple;
}
