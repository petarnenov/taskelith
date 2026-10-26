## Why

The UI proof of concept in `docs/ui-poc/` listed two departures from the `product-ui` requirement "Design rules": most controls used Mantine's default sizes below the required 44 px, and dimmed text in the light color scheme was Mantine's `gray.6` on white, about 3.3:1, below the required 4.5:1. On 2026-10-26 the owner asked for both to be fixed with Mantine's own theme settings, as G3 decision D17 and ADR 0011 allow. A measurement of the build also showed that dimmed text in the dark color scheme, Mantine's `dark.2`, is below 4.5:1 on every surface it appears on. After the first review pass, on 2026-10-26, the owner widened the scope: every text in both color schemes, including colored text, `Anchor` text, placeholders, and text on filled buttons and badges, must reach 4.5:1 on its actual background, with Mantine's theme settings only.

## What Changes

- `docs/ui-poc/src/theme.tsx`, moved out of `src/main.tsx`: the theme's `components` set default props so that every interactive target is at least 44 px (`Button`, `Menu.Item`, `NavLink`, `ActionIcon`, `CloseButton`, `Burger`, `TextInput`, `PasswordInput`, `Textarea`, `SegmentedControl`, `Anchor`); `primaryShade` 7, `autoContrast`, and a `luminanceThreshold` of 0.179 make text on filled colors readable; a `cssVariablesResolver` sets the dimmed color to `gray.7` in the light and `dark.1` in the dark color scheme, placeholders, disabled text, and errors to readable colors, and each palette color's light-scheme text, light-variant, and outline color to a shade that reaches 4.5:1; the `Breadcrumbs` separator defaults to dimmed text.
- `docs/ui-poc/src/main.tsx`: explicit 44 px props that the theme now covers are removed, and the "Sign out" menu item takes `c="red"`.
- `docs/ui-poc/src/ui.tsx`: `TARGET_SIZE`, the 44 px of the design rules.
- `docs/ui-poc/src/screens/Board.tsx`: the board card's title and "Open session" buttons get `mih` 44 px.
- `docs/ui-poc/src/screens/NewTask.tsx`: the vertical segmented controls drop `size="xs"`.
- `docs/ui-poc/README.md`: the section "Departures from the product UI specification" becomes "Design rules" and says how both rules are met and how far the measurement reached; the published build is version 7 with its new size and SHA-256.
- `docs/decisions/0011-mantine-ui-proof-of-concept.md`: the consequence that said the proof of concept departs from "Design rules" now says that the departure was met on 2026-10-26, as far as the measurement reached.

## Capabilities

### New Capabilities

### Modified Capabilities

None. The change brings reference material in line with the existing `product-ui` requirement "Design rules" without changing a requirement, so it sets `skip_specs: true`.

## Impact

Reference material and documentation only. `docs/ui-poc/` is not a workspace package and `make verify` neither builds nor tests it. The published proof of concept artifact is republished as version 7.
