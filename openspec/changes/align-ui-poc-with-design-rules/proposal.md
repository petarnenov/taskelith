## Why

The UI proof of concept in `docs/ui-poc/` listed two departures from the `product-ui` requirement "Design rules": most controls used Mantine's default sizes below the required 44 px, and dimmed text in the light color scheme was Mantine's `gray.6` on white, about 3.3:1, below the required 4.5:1. On 2026-10-26 the owner asked for both to be fixed with Mantine's own theme settings, as G3 decision D17 and ADR 0011 allow.

Scope history, all on 2026-10-26: after the first review pass the owner widened the scope to every text in both color schemes. After the second review pass the owner decided that the proof of concept does not override Mantine's colors, and narrowed this change to the 44 px touch targets. Contrast stays a recorded departure for G3 item 28.

## What Changes

- `docs/ui-poc/src/theme.tsx`, moved out of `src/main.tsx`: the theme's `components` set default props so that every interactive target is at least 44 px (`Button`, `Menu.Item`, `NavLink`, `ActionIcon`, `CloseButton`, `Burger`, `TextInput`, `PasswordInput`, `Textarea`, `SegmentedControl`, `Anchor`), and `TARGET_SIZE` holds the 44 px. Colors stay Mantine's defaults.
- `docs/ui-poc/src/main.tsx`: explicit 44 px props that the theme now covers are removed.
- `docs/ui-poc/src/screens/Board.tsx`: the board card's title and "Open session" buttons get `mih` 44 px.
- `docs/ui-poc/src/screens/NewTask.tsx`: the vertical segmented controls drop `size="xs"`.
- `docs/ui-poc/README.md`: the section "Departures from the product UI specification" becomes "Design rules": the touch targets are met, and contrast is an open departure for item 28 with the measured default ratios; the published build is version 7 with its new size and SHA-256.
- `docs/decisions/0011-mantine-ui-proof-of-concept.md`: the consequence about "Design rules" now says that the targets were met on 2026-10-26 and that contrast remains for item 28.

## Capabilities

### New Capabilities

### Modified Capabilities

None. The change brings reference material closer to the existing `product-ui` requirement "Design rules" without changing a requirement, so it sets `skip_specs: true`.

## Impact

Reference material and documentation only. `docs/ui-poc/` is not a workspace package and `make verify` neither builds nor tests it. The published proof of concept artifact is republished as version 7.
