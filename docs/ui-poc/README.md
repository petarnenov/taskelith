# UI proof of concept (Mantine)

This directory holds the source of the official UI proof of concept, rebuilt on 2026-10-25 with Mantine only, as G3 decision D17 requires ([ADR 0011](../decisions/0011-mantine-ui-proof-of-concept.md)). It is the starting point for G3 item 28 `scaffold-web-spa` and for the UI items that build a screen it shows ([G3 work plan](../g3-plan.md)).

It is reference material, not product code: it is not a workspace package, `make verify` neither builds nor tests it, and its libraries are not admitted dependencies. The [product UI specification](../../openspec/specs/product-ui/spec.md) and the ADRs stay the binding record; where they and the proof of concept differ, they win.

## What it shows

Ten screens in one Mantine `AppShell`, with static sample data and simulated live behavior:

| Screen | Source | Main Mantine components |
| --- | --- | --- |
| Project board (landing) | `src/screens/Board.tsx`, `BoardDrawers.tsx`, `board-data.ts`, `board-model.ts`, `LiveStatus.tsx` | `ScrollArea`, `Card`, `SegmentedControl`, `Drawer`, `Table`, `Switch`, `Notification` |
| Agent session | `src/screens/Session.tsx` | `Grid`, `Code`, `Timeline`, `TextInput`, `Loader` |
| Reviews | `src/screens/Reviews.tsx` | `Paper`, `DataList`, `Alert` |
| Workers and account pools | `src/screens/Workers.tsx` | `SimpleGrid`, `Progress`, `Collapse`, `List` |
| New task | `src/screens/NewTask.tsx` | `SegmentedControl`, `TextInput`, `Textarea`, `Timeline` |
| Knowledge | `src/screens/Knowledge.tsx` | `TextInput`, `SegmentedControl`, `Table` |
| Needs you | `src/screens/Inbox.tsx` | `Paper`, `Alert`, `Button` |
| SCM integrations | `src/screens/Integrations.tsx` | `Card`, `DataList`, `Alert` |
| Plugins | `src/screens/Plugins.tsx` | `SimpleGrid`, `Card`, `List` |
| Board states | `src/screens/States.tsx` | `Stepper`, `EmptyState`, `Skeleton`, `Alert` |

Shared parts: `src/theme.tsx` (the Mantine theme and its CSS variables resolver), `src/main.tsx` (shell, navigation, the session check, the account menu, and the sign-in screen), `src/store.tsx` (screen, sign-in, persona and role capabilities, server-confirmed answers, and the event cursor), `src/ui.tsx` (the session status derived from execution facts, the role-aware button, the later-gate marker, gate colors, the 44 px target size, page header, diff block, facts list), and `src/icons.tsx`.

The account menu behind the operator's avatar names the signed-in operator and their roles, switches the proof of concept between three personas (installation-owner and project-maintainer, project-operator, project-viewer), and offers account settings, a password change, and "Sign out". Signing out shows the sign-in screen of G3 decision D2 (a), password login with a server-side session; agents and merges keep running. In the proof of concept "Sign out" and "Sign in" work and accept any input; "Account settings" and "Change password" are inert and belong to G3 item 10 `implement-operator-login-and-roles`.

The theme is Mantine's default with `primaryColor: 'indigo'`, `defaultRadius: 'md'`, and IBM Plex Sans and Mono. Its primary shade, automatic contrast, component default props, and a CSS variables resolver meet the specification's design rules, as "Design rules" below describes. Dark is the default color scheme and light is supported, both through Mantine's color scheme manager. The theme sets `respectReducedMotion`, so no indicator spins when the system asks for reduced motion. Below Mantine's `xl` breakpoint the navigation moves into the `AppShell` navbar behind a `Burger`.

## Alignment with the implemented backend

On 2026-10-25 the proof of concept was reviewed against the backend on `dev` at `69e5bd2` and aligned with it (change `align-ui-poc-with-backend`):

- **Board.** A card is a workflow run bound to a native work item (`openspec:<change>`, `speckit:<feature>`). Its stages come from the OpenSpec plugin's stage graph and the SpecKit mapping fixture, shown in a linear order although the graphs only fix dependencies. Each stage has its own gates with a required evidence kind (structural validation, semantic approval, platform record), a state, a generation, and a decision; the backend names these, but which gates a stage has is configured per run, so the gates shown per stage are illustrative. The column is the UI's placement of a stage by its lifecycle obligation, the card shows the worst gate of its current stage, and merge is a platform-added step after Review, not a framework stage.
- **Admission and binding.** The run detail shows the admission of the current stage (kind, state, invalidating revision) or that a platform-managed stage admits none, the artifact revision as artifact, digest, and native reference, and the run binding with the workflow IDs `openspec/spec-driven` and `speckit/speckit`.
- **Session status.** The badge is derived from execution facts (attempt phase, assignment, reachability, native evidence, cancellation, outcome with its cancelled flag, and the turn state that sessions add in G3 items 4 and 13) and never stored. Verify, review, and closure are platform stages, not agent steps. An unreachable worker and an uncertain process are separate states, ownership stays with the worker at its generation, and an uncertain attempt offers an audited reconciliation. Stop requests wait for proof, can stay pending while the worker is unreachable, and attempts end with an outcome.
- **Roles.** Actions follow the trust model: runtime requests, turns, stop, and task submission need `project-operator`; gate approvals, settings, standing rules, and reconciliation need `project-maintainer`; worker enrollment, drain, and revocation need `installation-owner`; `project-viewer` reads only. A disabled action names the role it needs.
- **Requests.** A runtime approval names its request, attempt, and provider generation, is answered once, and shows "sending" until the server confirms. A spec decision is a semantic verdict, approved or rejected; the first answer in the inbox meets a newer revision and shows the server's conflict. New task generates its `runId` and `taskId` once per draft, and turns carry a client turn key.
- **Workers and capacity.** Workers show reachability, draining, revocation, and admission pressure with its cause; capacity is declared and reserved slots, CPU, and memory; slots count active attempts. Quotas are concurrency, delegation, and retry budgets; usage is accounted, not reserved.
- **Plugins.** Plugin API `0.2.0`, `sdlc-openspec 0.0.0` with range `^0.2.0` and capabilities `validate-structure` and `finalize`, registration outcomes (registered, or rejected with `invalid`, `not-found`, or `precondition-failed`) separate from the dependency register status, and the ports `AgentHarness` and `SourceControlProvider` as planned.
- **Later gates.** What the backend does not have yet is marked with the gate or plan item that adds it: SpecKit runs, framework selection, and Codex in G4, on every Codex session, worker, pool, and reviewer; Claude Code on Linux as qualification pending; Knowledge in G5; imports other than GitHub issues beyond G3 (D9); sessions and turns, account pools, traceability, delegated spec approval, standing rules, the review runtime, and the composition root in their G3 items. The live cursor and the session check stand for G3 items 14, 9, and 10.
- **Board states.** Added a cursor-expired resynchronization, a restore quarantine, and a first step that signs in with the bootstrap credential to create the first installation-owner.

Reconciling an attempt in an uncertain state belongs to `project-maintainer` and is audited, as the owner decided on 2026-10-25 and the [trust model](../trust-model.md) section 3 records.

## Departures from "only Mantine"

- Mantine has no icon set, so `src/icons.tsx` draws seven small inline SVG icons. No other UI library is used.
- Emphasis borders and column backgrounds use Mantine style props (`bd`, `bg`) with Mantine's CSS variables, and the theme's default props use style props (`mih`, `miw`, `lh`, `display`) for touch targets. There is no custom CSS and no Styles API override.
- The `MantineProvider`'s `cssVariablesResolver` rewrites Mantine CSS variables for contrast: the dimmed, placeholder, disabled, and error colors in both schemes, and each palette color's text, light-variant, and outline colors in the light scheme. The theme's `Breadcrumbs` default separator is a Mantine `Text` in the dimmed color. Item 28 decides whether these stay within D17.
- Where Mantine cannot match the earlier design canvas, Mantine's version stands, for example its upper-case badges.

## Design rules

The specification's requirement "Design rules" asks for interactive targets of at least 44 px and text contrast of at least 4.5:1 in both color schemes. Since 2026-10-26 (change `align-ui-poc-with-design-rules`) every interactive target and every text the change's measurement reached meets both, through the theme and the `MantineProvider`'s CSS variables resolver in `src/theme.tsx` and three call-site props in `src/screens/Board.tsx`, `src/screens/NewTask.tsx`, and `src/main.tsx`; `TARGET_SIZE` in `src/ui.tsx` holds the 44 px. The measurement opened every screen, drawer, panel, board state, and menu in both color schemes at desktop width, without hovering or focusing each control; hover colors were checked against Mantine's palette instead.

- **Touch targets.** The theme's `components` set default props: `Button`, `Menu.Item`, and `NavLink` get `mih` 44 px, so every size, including `xs` and `compact-xs`, is at least 44 px tall; `ActionIcon` and `CloseButton` default to size `xl` (44 px) and `Burger` to `lg` (44 px); `TextInput`, `PasswordInput`, and `Textarea` default to size `lg` (50 px), and the password visibility toggle gets `miw` and `mih` 44 px; `SegmentedControl` gets a line height that makes each segment 44 px; `Anchor` is an inline block with `miw` and a line height of 44 px. The board card's title and "Open session" are `UnstyledButton`s with `mih` 44 px, because a theme default for `UnstyledButton` would reach every Mantine component built on it. The explicit `size="xs"` on the new task's vertical segmented controls is removed, so they use the theme's 44 px.
- **Text on filled colors.** `primaryShade` is 7 in both schemes, and `autoContrast` with a `luminanceThreshold` of 0.179 gives filled buttons and badges black or white text, whichever contrasts more; at that luminance both reach about 4.58:1, so the chosen one is never below it. With shade 7 the same text also passes on the hover shade 8 of every color the proof of concept uses.
- **Colored text in the light scheme.** Mantine draws `c="<color>"` text and outlines in the primary shade, 7 here, and light-variant text in shade 9, below 4.5:1 for most colors. The resolver sets each palette color's text, light-variant, and outline color to its lightest shade from 6 to 9 that reaches 4.5:1 on its shade 2, the light variant's hover background, and darkens shade 9 in 5% steps with Mantine's `darken` where none does: indigo, orange, red, and teal are darkened, and gray uses shade 7. The dark scheme's shades pass as they are.
- **Dimmed and derived colors.** The dimmed color is `gray.7` (`#495057`) in the light and `dark.1` (`#b8b8b8`) in the dark scheme, replacing Mantine's `gray.6` and `dark.2`; placeholders and disabled text use the dimmed color, and the error color is red's text color. The `Breadcrumbs` separator, which Mantine draws in `dark.2`, is a dimmed `Text`, and the "Sign out" menu item, which Mantine draws in red shade 6 whatever the theme, takes `c="red"`.
- **Measured result.** Before the change 55 of 167 measured text kinds were below 4.5:1, at worst 2.02:1 in the light and 2.47:1 in the dark scheme, and disabled text reached 1.75:1. After it none is: the lowest is 4.77:1 in the light and 4.58:1 in the dark scheme, and disabled text is at least 6.85:1.

## Published build

The build is published as a private claude.ai artifact, <https://claude.ai/artifact/M8VnvLLCrAMiBPrkKezGzk> (unversioned private page; version 7 matches this source), as one HTML file of 922,082 bytes with SHA-256 `00a0c26920f8a36907fd5ae7a10b577a76a06dbbeca4ff83226a0a29e60bee32`. All code and Mantine's styles are inlined; only the IBM Plex fonts load from Google Fonts, so a viewer's browser contacts Google, and offline the page falls back to the system fonts. The owner shares the artifact from its Share menu. The earlier design canvas, <https://claude.ai/artifact/Q84QABcHZZ1ow9B7UcZdNS> (unversioned private page), which [ADR 0008](../decisions/0008-product-ui-and-integration-authority.md) was decided on, is marked as superseded.

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
