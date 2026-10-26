## Context

The `product-ui` requirement "Design rules" requires interactive targets of at least 44 px and text contrast of at least 4.5:1 in both themes. The proof of concept in `docs/ui-poc/` is reference material under the requirement "Reference proof of concept": where it differs from the specification, the specification wins. G3 decision D17 allows only Mantine, with no custom components or style overrides; ADR 0011 and the proof of concept's README read that as no custom CSS and no Styles API override.

## Goals / Non-Goals

Make every interactive target of the proof of concept at least 44 px with Mantine's theme settings and Mantine props only. Do not change colors: on 2026-10-26 the owner decided that the proof of concept keeps Mantine's default colors, so contrast is recorded as an open departure for G3 item 28. Do not change a requirement or the screens' content or behavior; do not port the proof of concept into the SPA, which is item 28.

## Decisions

- **Theme default props first.** Each component kind gets its default in the theme's `components`, so a screen needs no per-control prop. Where a Mantine size reaches 44 px, the default is that size: `ActionIcon` and `CloseButton` `xl`, `Burger` `lg`. Inputs have no 44 px size, so `TextInput`, `PasswordInput`, and `Textarea` default to `lg` (50 px), which also enlarges their text, label, and description to the `lg` font size. Where no size fits, the default is a Mantine style prop: `mih` 44 px for `Button`, `Menu.Item`, and `NavLink`, which also lifts the explicit `xs` and `compact-xs` buttons, so their sizes stay; `miw` and `mih` for the password visibility toggle; a line height for `SegmentedControl`, whose segments have 3 px vertical padding at the default size; and an inline block with `miw` and a 44 px line height for `Anchor`.
- **Call sites.** The board card's title and "Open session" are `UnstyledButton`s and get `mih` at the call site, because `Button`, `ActionIcon`, `NavLink`, `Menu.Item`, `Stepper`, and other Mantine components render through `UnstyledButton`, so a theme default for it would change them all. The vertical segmented controls on the new task screen drop `size="xs"`, whose 2 px padding would leave segments at 42 px, and the header's `Burger` drops `size="sm"`, which would keep it at 28 px. These are the three call-site changes.
- **A theme module.** The theme moves from `src/main.tsx` into `src/theme.ts` with `TARGET_SIZE`, so the theme depends only on Mantine, and screens take the target size from the theme rather than from the UI helpers.
- **Contrast deferred.** An earlier revision of this change met contrast by overriding Mantine color variables through the `MantineProvider`'s `cssVariablesResolver` and by changing `primaryShade`, `autoContrast`, and `luminanceThreshold`. The owner decided on 2026-10-26 that Mantine's colors are not to be overridden in the proof of concept, so those changes were removed. The README records the default ratios below 4.5:1, and item 28 decides how the SPA meets the rule within D17.
- **Why `skip_specs` holds.** The `.tsx` files under `docs/ui-poc/` change, but they are reference material, not product code: no workspace builds, tests, or ships them. The binding record is the `product-ui` requirement "Design rules", which already states both rules; the change makes the reference conform to one of them and records the other as a departure, as the requirement "Reference proof of concept" expects, and adds, removes, or rewords no requirement or scenario.
- **The ADR consequence.** ADR 0011 recorded the departure as a fact and said that item 28 would meet it. That consequence is rewritten as history: the targets are met, and contrast remains for item 28. The decision itself is unchanged.

## Risks / Trade-offs

- Taller buttons, 50 px inputs with `lg` text, and 44 px segments make the screens less dense than Mantine's defaults. The design rules require it.
- Badges that only show a tooltip on hover stay smaller than 44 px; item 28 decides whether they count as targets.
- An `Anchor` with a 44 px line height inside running text would space its lines apart; every `Anchor` in the proof of concept stands alone. Item 28 decides how inline links in prose meet the rule.
- The segment line height depends on Mantine's default `SegmentedControl` padding; a later Mantine version that changes it needs a new measurement.
- Text contrast stays below the design rules in the proof of concept until item 28.
