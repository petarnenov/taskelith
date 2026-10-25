# UI proof of concept (Mantine)

This directory holds the source of the official UI proof of concept, rebuilt on 2026-10-25 with Mantine only, as G3 decision D17 requires ([ADR 0011](../decisions/0011-mantine-ui-proof-of-concept.md)). It is the starting point for G3 item 28 `scaffold-web-spa` and the UI items after it ([G3 work plan](../g3-plan.md)).

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

Shared parts: `src/main.tsx` (theme, shell, navigation), `src/store.tsx` (screen and "Needs you" state shared by the board and the inbox), `src/ui.tsx` (harness activity badge, gate colors, page header, diff block, facts list), and `src/icons.tsx`.

The theme is Mantine's default with `primaryColor: 'indigo'`, `defaultRadius: 'md'`, and IBM Plex Sans and Mono. Dark is the default color scheme and light is supported, both through Mantine's color scheme manager. Below Mantine's `xl` breakpoint the navigation moves into the `AppShell` navbar behind a `Burger`.

## Departures from "only Mantine"

- Mantine has no icon set, so `src/icons.tsx` draws seven small inline SVG icons. No other UI library is used.
- Emphasis borders and column backgrounds use Mantine style props (`bd`, `bg`) with Mantine's CSS variables. There is no custom CSS and no Styles API override.
- Where Mantine cannot match the earlier design canvas, Mantine's version stands, for example its upper-case badges.

## Published build

The build is published as a private claude.ai artifact, <https://claude.ai/artifact/M8VnvLLCrAMiBPrkKezGzk>, as one self-contained HTML file (856,510 bytes, SHA-256 `08602d9e…74818`). The owner shares it from the artifact's Share menu. The earlier design canvas, <https://claude.ai/artifact/Q84QABcHZZ1ow9B7UcZdNS>, which [ADR 0008](../decisions/0008-product-ui-and-integration-authority.md) was decided on, is marked as superseded.

## Rebuilding

The build runs outside the workspaces, in a scratch copy, so that no dependency enters the repository before item 1 admits it:

```sh
cp -R docs/ui-poc /tmp/ui-poc && cd /tmp/ui-poc
echo '{ "private": true, "type": "module" }' > package.json
npm install --ignore-scripts react@19.2.8 react-dom@19.2.8 @mantine/core@9.7.3 \
  @mantine/hooks@9.7.3 esbuild@0.28.2 typescript @types/react @types/react-dom
npx tsc -p . && node build.mjs
```

`build.mjs` bundles `src/main.tsx` with esbuild, inlines `@mantine/core/styles.css`, and writes `dist/taskelith-ui-poc.html`. It was built with Node.js 24.22.1.

Mantine 9 differs from Mantine 7 and 8 in places the SPA will meet: `Grid` takes `gap` instead of `gutter`, `Collapse` takes `expanded`, and `EmptyState` and `DataList` are new components.
