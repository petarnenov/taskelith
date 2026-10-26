import {
  ActionIcon,
  Anchor,
  Burger,
  Button,
  CloseButton,
  Menu,
  NavLink,
  PasswordInput,
  SegmentedControl,
  Textarea,
  TextInput,
  createTheme,
  rem,
} from '@mantine/core';

// The product UI design rules require interactive targets of at least 44 px.
export const TARGET_SIZE = 44;

// Mantine 9.7.3's default segment padding above and below the label.
const SEGMENT_PADDING_Y = 3;
const SEGMENT_LINE_HEIGHT = TARGET_SIZE - 2 * SEGMENT_PADDING_Y;

export const theme = createTheme({
  primaryColor: 'indigo',
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
