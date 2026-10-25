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

Shared parts: `src/main.tsx` (theme, shell, navigation, the session check, the account menu, and the sign-in screen), `src/store.tsx` (screen, sign-in, persona and role capabilities, server-confirmed answers, and the event cursor), `src/ui.tsx` (the session status derived from execution facts, the role-aware button, the later-gate marker, gate colors, page header, diff block, facts list), and `src/icons.tsx`.

The account menu behind the operator's avatar names the signed-in operator and their roles, switches the proof of concept between three personas (installation-owner and project-maintainer, project-operator, project-viewer), and offers account settings, a password change, and "Sign out". Signing out shows the sign-in screen of G3 decision D2 (a), password login with a server-side session; agents and merges keep running. In the proof of concept "Sign out" and "Sign in" work and accept any input; "Account settings" and "Change password" are inert and belong to G3 item 10 `implement-operator-login-and-roles`.

The theme is Mantine's default with `primaryColor: 'indigo'`, `defaultRadius: 'md'`, and IBM Plex Sans and Mono. Dark is the default color scheme and light is supported, both through Mantine's color scheme manager. The theme sets `respectReducedMotion`, so no indicator spins when the system asks for reduced motion. Below Mantine's `xl` breakpoint the navigation moves into the `AppShell` navbar behind a `Burger`.

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

Open for item 28: the trust model names no role for reconciling an uncertain attempt; the proof of concept gives it to `project-maintainer`.

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

The build is published as a private claude.ai artifact, <https://claude.ai/artifact/M8VnvLLCrAMiBPrkKezGzk> (unversioned private page; version 6 matches this source), as one HTML file of 920,512 bytes with SHA-256 `8791c89f4997a5a1afcb9354a03a8a7f4606cf0fd16f2011c693062f75310282`. All code and Mantine's styles are inlined; only the IBM Plex fonts load from Google Fonts, so a viewer's browser contacts Google, and offline the page falls back to the system fonts. The owner shares the artifact from its Share menu. The earlier design canvas, <https://claude.ai/artifact/Q84QABcHZZ1ow9B7UcZdNS> (unversioned private page), which [ADR 0008](../decisions/0008-product-ui-and-integration-authority.md) was decided on, is marked as superseded.

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
