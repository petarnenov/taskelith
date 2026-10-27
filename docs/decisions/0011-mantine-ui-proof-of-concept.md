# ADR 0011: Mantine UI proof of concept as the SPA reference

Date: 2026-10-25
Status: Decided by the owner on 2026-10-25 in the project conversation. Recorded; no SPA code exists yet. Amends the consequence of [ADR 0008](0008-product-ui-and-integration-authority.md) that kept the proof of concept out of this repository.

## Context

ADR 0008 was decided while the owner reviewed a UI proof of concept: a private design canvas with ten screens, drawn with hand-made styles. ADR 0008 kept that proof of concept outside the repository as reference material.

On 2026-10-25 the owner decided G3 decision D17: the SPA uses Mantine and only Mantine, with no custom components, style overrides, or other UI library, except the terminal view of D18, and Mantine's version stands where it cannot match the proof of concept ([G3 work plan](../g3-plan.md)). The canvas no longer showed what the SPA will look like, so the owner asked for the proof of concept to be reworked with Mantine.

The rework rebuilt the same ten screens as a React application with Mantine 9.7.3 components, its theme, and its light and dark color schemes, and added an account menu with "Sign out" and the sign-in screen of D2. It is published as a private claude.ai artifact, and its source is in [`docs/ui-poc/`](../ui-poc/README.md).

## Decisions

1. **Official proof of concept.** The Mantine build, <https://claude.ai/artifact/M8VnvLLCrAMiBPrkKezGzk> (unversioned private page), is the official UI proof of concept. The earlier design canvas, <https://claude.ai/artifact/Q84QABcHZZ1ow9B7UcZdNS> (unversioned private page), is superseded and marked so on the canvas. The decisions of ADR 0008 stay in force; only the reference that illustrates them changes.
2. **Source in the repository.** The proof of concept's source is stored in `docs/ui-poc/` as reference material, not product code: it is not a workspace package, `make verify` does not build or test it, and it carries no `package.json` or lockfile, so it admits no dependency. Its README records how to rebuild it in a scratch copy.
3. **Starting point for item 28.** G3 item 28 `scaffold-web-spa` starts from this proof of concept: it may port the source into the SPA workspace once item 1 has qualified React and Mantine and the dependency policy admits them, and then the source becomes product code under every engineering principle, including the coverage rule. esbuild is only the reference build's bundler and is not proposed as a dependency. The UI items that build a screen the proof of concept shows follow it; item 40, the terminal view, has no matching screen, and the knowledge and framework-selection screens wait for their gates (D10).
4. **Binding record.** The product UI specification and the ADRs remain binding. Where the proof of concept differs from them, they win, and the item that builds the screen records the difference in its change.

## Consequences

- ADR 0008's status names this amendment.
- The `product-ui` specification gains a requirement naming the reference proof of concept.
- Item 28 of the G3 work plan names `docs/ui-poc/` as its starting point.
- The proof of concept's departures from "only Mantine" (seven inline SVG icons, because Mantine has no icon set, Mantine style props with Mantine's CSS variables for emphasis, and, since 2026-10-26, style props in the theme's default props and at two board call sites for touch targets) are listed in its README; item 28 decides whether they stay, within D17.
- When this decision was taken, the proof of concept departed from the `product-ui` requirement "Design rules": most controls were below 44 px, and dimmed text in the light color scheme was below 4.5:1. On 2026-10-26 the change `align-ui-poc-with-design-rules` met the 44 px targets with the theme's component default props and three call-site changes: two `mih` props on the board and the removal of `size="xs"` from the new task's segmented controls and of `size="sm"` from the header's `Burger`. The owner decided that the proof of concept keeps Mantine's default colors, so text contrast below 4.5:1 in both color schemes, for several of Mantine's default colors, remains for item 28; the proof of concept's README lists it.
