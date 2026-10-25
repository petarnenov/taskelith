# UI proof of concept (Mantine)

This directory holds the source of the official UI proof of concept, rebuilt on 2026-10-25 with Mantine only, as G3 decision D17 requires ([ADR 0011](../decisions/0011-mantine-ui-proof-of-concept.md)). It is the starting point for G3 item 28 `scaffold-web-spa` and for the UI items that build a screen it shows ([G3 work plan](../g3-plan.md)).

It is reference material, not product code: it is not a workspace package, `make verify` neither builds nor tests it, and its libraries are not admitted dependencies. The [product UI specification](../../openspec/specs/product-ui/spec.md) and the ADRs stay the binding record; where they and the proof of concept differ, they win.

## What it shows

Ten screens in one Mantine `AppShell`, with static sample data and simulated live behavior:

| Screen | Source | Main Mantine components |
| --- | --- | --- |
| Project board (landing) | `src/screens/Board.tsx`, `BoardDrawers.tsx`, `board-data.ts`, `board-model.ts` | `ScrollArea`, `Card`, `SegmentedControl`, `Drawer`, `Timeline`, `Switch`, `Notification` |
| Agent session | `src/screens/Session.tsx` | `Grid`, `Code`, `Timeline`, `TextInput`, `Loader` |
| Reviews | `src/screens/Reviews.tsx` | `Paper`, `DataList`, `Alert` |
| Workers and account pools | `src/screens/Workers.tsx` | `SimpleGrid`, `Progress`, `Collapse`, `List` |
| New task | `src/screens/NewTask.tsx` | `SegmentedControl`, `TextInput`, `Textarea`, `Timeline` |
| Knowledge | `src/screens/Knowledge.tsx` | `TextInput`, `SegmentedControl`, `Table` |
| Needs you | `src/screens/Inbox.tsx` | `Paper`, `Alert`, `Button` |
| SCM integrations | `src/screens/Integrations.tsx` | `Card`, `DataList`, `Alert` |
| Plugins | `src/screens/Plugins.tsx` | `SimpleGrid`, `Card`, `List` |
| Board states | `src/screens/States.tsx` | `Stepper`, `EmptyState`, `Skeleton`, `Alert` |

Shared parts: `src/main.tsx` (theme, shell, navigation, the account menu, and the sign-in screen), `src/store.tsx` (screen, sign-in, and "Needs you" state shared by the screens), `src/ui.tsx` (harness activity badge, gate colors, page header, diff block, facts list), and `src/icons.tsx`.

The account menu behind the operator's avatar names the signed-in operator and their roles and offers account settings, a password change, and "Sign out". Signing out shows the sign-in screen of G3 decision D2 (a), password login with a server-side session; agents and merges keep running. Only "Sign out" works in the proof of concept.

The theme is Mantine's default with `primaryColor: 'indigo'`, `defaultRadius: 'md'`, and IBM Plex Sans and Mono. Dark is the default color scheme and light is supported, both through Mantine's color scheme manager. Below Mantine's `xl` breakpoint the navigation moves into the `AppShell` navbar behind a `Burger`.

## Departures from "only Mantine"

- Mantine has no icon set, so `src/icons.tsx` draws seven small inline SVG icons. No other UI library is used.
- Emphasis borders and column backgrounds use Mantine style props (`bd`, `bg`) with Mantine's CSS variables. There is no custom CSS and no Styles API override.
- Where Mantine cannot match the earlier design canvas, Mantine's version stands, for example its upper-case badges.

## Departures from the product UI specification

The specification's requirement "Design rules" wins over these, and item 28 resolves them:

- **Touch targets.** Most controls use Mantine's default sizes, below the required 44 px: a default `Button` is 36 px, `size="xs"` is 30 px, `size="compact-xs"` is about 22 px, and `Anchor` links are as tall as their text. Only the header controls and the sign-in button are 44 px.
- **Contrast.** `c="dimmed"` text in the light color scheme is Mantine's `gray.6` on white, about 3.4:1, below the required 4.5:1.

Both can be met with Mantine's own theme settings, for example component default sizes and the theme's dimmed color, which D17 allows.

## Published build

The build is published as a private claude.ai artifact, <https://claude.ai/artifact/M8VnvLLCrAMiBPrkKezGzk> (unversioned private page; version 2 matches this source), as one HTML file of 901,446 bytes with SHA-256 `85c3e6f2f9afb8349e065c699d1f56671f4e35aae2b0fa4e18f9753a6e53c791`. All code and Mantine's styles are inlined; only the IBM Plex fonts load from Google Fonts, so a viewer's browser contacts Google, and offline the page falls back to the system fonts. The owner shares the artifact from its Share menu. The earlier design canvas, <https://claude.ai/artifact/Q84QABcHZZ1ow9B7UcZdNS> (unversioned private page), which [ADR 0008](../decisions/0008-product-ui-and-integration-authority.md) was decided on, is marked as superseded.

## Rebuilding

The build runs outside the workspaces, in a scratch copy, so that no dependency enters the repository:

```sh
scratch="$(mktemp -d)" && cp -R docs/ui-poc/. "$scratch" && cd "$scratch"
echo '{ "private": true, "type": "module" }' > package.json
npm install --ignore-scripts react@19.2.8 react-dom@19.2.8 @mantine/core@9.7.3 @mantine/hooks@9.7.3 \
  esbuild@0.28.2 typescript@7.0.2 @types/react@19.3.0 @types/react-dom@19.3.0
npx tsc -p . && node build.mjs
```

`build.mjs` bundles `src/main.tsx` with esbuild, keeps the libraries' license comments at the end of the bundle, inlines `@mantine/core/styles.css`, and writes `dist/taskelith-ui-poc.html`. It was built with Node.js 24.22.1. esbuild is only this reference build's bundler; the SPA's build tool is Vite (D1).

Mantine 9 differs from Mantine 7 and 8 in places the SPA will meet: `Grid` takes `gap` instead of `gutter`, `Collapse` takes `expanded`, and `EmptyState` and `DataList` are new components.
