## Context

The `product-ui` requirement "Design rules" requires interactive targets of at least 44 px and text contrast of at least 4.5:1 in both themes. The proof of concept in `docs/ui-poc/` is reference material under the requirement "Reference proof of concept": where it differs from the specification, the specification wins. G3 decision D17 allows only Mantine, with no custom components or style overrides; ADR 0011 and the proof of concept's README read that as no custom CSS and no Styles API override.

## Goals / Non-Goals

Make every interactive target of the proof of concept at least 44 px and dimmed text at least 4.5:1 in both color schemes, with Mantine's theme settings and Mantine props only. Do not change a requirement, the screens' content or behavior, or other text colors; do not port the proof of concept into the SPA, which is G3 item 28.

## Decisions

- **Theme default props first.** Each component kind gets its default in the theme's `components`, so a screen needs no per-control prop. Where a Mantine size reaches 44 px without enlarging the text, the default is that size: `ActionIcon` and `CloseButton` `xl`, `Burger` `lg`. Inputs have no 44 px size, so `TextInput`, `PasswordInput`, and `Textarea` default to `lg` (50 px). Where no size fits, the default is a Mantine style prop: `mih` 44 px for `Button`, `Menu.Item`, and `NavLink`, which also lifts the explicit `xs` and `compact-xs` buttons, so their sizes stay; `miw` and `mih` for the password visibility toggle; a line height for `SegmentedControl`, whose segments have 3 px vertical padding at the default size; and an inline block with `miw` and a 44 px line height for `Anchor`.
- **Two call sites.** The board card's title and "Open session" are `UnstyledButton`s and get `mih` at the call site, because `Button`, `ActionIcon`, `NavLink`, `Menu.Item`, `Stepper`, and other Mantine components render through `UnstyledButton`, so a theme default for it would change them all. The vertical segmented controls on the new task screen drop `size="xs"`, whose 2 px padding would leave segments at 42 px.
- **Dimmed color through the CSS variables resolver.** Mantine defines `--mantine-color-dimmed` in its CSS variables resolver, a `MantineProvider` setting. The proof of concept's resolver overrides only that variable: `gray.7` in the light and `dark.1` in the dark color scheme, the nearest palette shades that reach 4.5:1 on every surface the build shows dimmed text on. It is neither CSS nor a Styles API override.
- **Why `skip_specs` holds.** The `.tsx` files under `docs/ui-poc/` change, but they are reference material, not product code: no workspace builds, tests, or ships them. The binding record is the `product-ui` requirement "Design rules", which already states both rules; the change makes the reference conform to it and adds, removes, or rewords no requirement or scenario.
- **The ADR consequence.** ADR 0011 recorded the departure as a fact and said that item 28 would meet it. That consequence is rewritten as history, so the ADR does not state something false; the decision itself is unchanged.

## Risks / Trade-offs

- Taller buttons, 50 px inputs, and 44 px segments make the screens less dense than Mantine's defaults. The design rules require it.
- An `Anchor` with a 44 px line height inside running text would space its lines apart; every `Anchor` in the proof of concept stands alone. Item 28 decides how inline links in prose meet the rule.
- The segment line height depends on Mantine's default `SegmentedControl` padding; a later Mantine version that changes it needs a new measurement.
