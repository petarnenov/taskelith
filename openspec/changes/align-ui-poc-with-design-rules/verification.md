# Verification: align-ui-poc-with-design-rules

## Scope and source

Source: on 2026-10-26 the owner asked for the two departures listed in `docs/ui-poc/README.md` under "Departures from the product UI specification" to be fixed: touch targets below 44 px and light-scheme dimmed text below 4.5:1, using only Mantine's own theme settings (G3 decision D17, ADR 0011). The coordinator assigned the task to a worker subagent on the same day and added four requirements: before-and-after measurements per control kind, the reasoning for `skip_specs` in `design.md`, the republication authorization below, and the assigned reviewer.

Scope history, all on 2026-10-26, passed on by the coordinator:

1. The first revisions met the touch targets and changed the dimmed color through the `MantineProvider`'s `cssVariablesResolver`.
2. After review pass 1 the owner widened the scope to every text in both color schemes. Commit `c324973` met it with `primaryShade` 7, `autoContrast`, a `luminanceThreshold` of 0.179, resolver overrides of Mantine color variables, a `Breadcrumbs` separator default, and `c="red"` on "Sign out".
3. After review pass 2 the owner decided that the proof of concept does not override Mantine's colors, and narrowed this change to the 44 px touch targets. Every color and contrast change was removed in a new commit; contrast is recorded as an open departure for G3 item 28.

Base revision: `64155ab` on `dev`. Prepared in the git worktree `../taskelith-worktrees/align-ui-poc-with-design-rules` on branch `align-ui-poc-with-design-rules`. Scope: `docs/ui-poc/src/theme.ts` (new, moved out of `src/main.tsx`), `src/main.tsx`, `src/screens/Board.tsx`, `src/screens/NewTask.tsx`, `docs/ui-poc/README.md`, one consequence in `docs/decisions/0011-mantine-ui-proof-of-concept.md`, and this change.

Outside the repository: republishing the proof of concept as version 7 of the private artifact `M8VnvLLCrAMiBPrkKezGzk` was authorized by the owner's direct assignment of this task on 2026-10-26. The coordinator publishes it; this change records the build that version 7 is to match.

Republish: pending.

## Environment

macOS 26.6.2 (Darwin 25.6.0, x86_64), Node.js v24.22.1 and npm 12.2.1 selected by `nvm use` from `.nvmrc`. The proof of concept was built as its README says, in a `mktemp -d` scratch copy outside the repository with the pinned `react@19.2.8`, `react-dom@19.2.8`, `@mantine/core@9.7.3`, `@mantine/hooks@9.7.3`, `esbuild@0.28.2`, `typescript@7.0.2`, `@types/react@19.3.0`, and `@types/react-dom@19.3.0`. Measurements ran in headless Google Chrome 155.0.8059.86 through `playwright-core@1.56.1`, installed in a separate scratch directory; nothing was installed into the repository.

## Author self-check before review

- Only Mantine: the change uses the theme's `components` default props, Mantine sizes, and Mantine style props (`mih`, `miw`, `lh`, `display`). It changes no color, and adds no CSS, no `styles`, `classNames`, or `vars`, no CSS variables resolver, and no component.
- The rebuild of the unchanged source at `64155ab` reproduced version 6 byte for byte: 920,512 bytes, SHA-256 `8791c89f4997a5a1afcb9354a03a8a7f4606cf0fd16f2011c693062f75310282`. That build is the "before" of the measurements.
- Builds of the earlier revisions, for the record: `66cfee1` and `93c627b` 921,275 bytes, SHA-256 `2c57b5b4a9833a11d91a79804f77df2e38731c918e6a66141da96d60653378a2`; `7b0d47b` 921,283 bytes, `66469fbd8aaf76b648a4cf5fd56efd80a94dfe6aebb9d7687a20ffe2fb000443`; `c324973` 922,082 bytes, `00a0c26920f8a36907fd5ae7a10b577a76a06dbbeca4ff83226a0a29e60bee32`.
- The final build is 921,114 bytes with SHA-256 `9041699f6b8670e6cb937843016a33971be29563ffc14406e67c9d9847cc7e3a`, version 7's build; `tsc -p .` passed on the reference source, and the measurements marked "after" ran on that file.
- Screenshots of the board, the session screen, and the new task screen in the dark scheme and of the board and the inbox in the light scheme, at 1600 × 1000, show no clipped or overlapping control.
- Comment rule: the new comments are one line each and within 80 characters; `npm run verify:comments` passed.
- Evidence check: no new external link. The artifact link in the README stays marked as an unversioned private page.

## Measurements

Method: a script loads the build at 1600 × 1000, opens every screen from the header navigation and the "Needs you" button, every board card's drawer (expanding "Reconcile…" where present), the auto-merge settings drawer, the worker enrollment panel, every board state, the new task screen before and after creating a task, and the account menu, in the dark and then the light scheme; then the phone navbar at 390 × 844 and the sign-in screen. It measures the bounding box of every control: every `button`, `a[href]`, visible input, `textarea`, and `menuitem`; for a visually hidden radio or checkbox it measures the label that takes the click. Targets are counted once per component kind and text, 148 in each build.

Touch targets, smallest height × smallest width per control kind:

| Control kind | Before | After | Setting |
| --- | --- | --- | --- |
| `Button` (46) | 22 × 56.5 px (`compact-xs`); `xs` 30, default 36 | 44 × 56.5 px | theme `mih` 44 |
| `ActionIcon` (3) | 26 × 26 px (password toggle) | 44 × 44 px | theme `size: 'xl'`; toggle `miw`/`mih` 44 |
| `UnstyledButton` (35) | 16.8 px tall ("Open session"); card titles 20.3 | 44 × 44 px | `mih` 44 at the two board call sites |
| `NavLink` (8) | 40.8 px tall | 44 px tall | theme `mih` 44 |
| `Menu.Item` (5, counted under `UnstyledButton`) | 35 px tall | 44 px tall | theme `mih` 44 |
| `SegmentedControl` segment (39) | 22.6 px (`xs`), 27.7 px (default) | 44 px tall, at least 54 wide | theme `lh` 38 px; `xs` removed |
| `Anchor` (7) | 20.3 × 33.7 px | 44 × 44 px | theme inline block, `miw` 44, `lh` 44 px |
| `TextInput`, `Textarea` (6) | 36 px tall | 50 px tall | theme `size: 'lg'` |
| `PasswordInput` (1) | 34 px tall | 48 px tall inner input | theme `size: 'lg'` |
| `CloseButton` (1) | 28 × 28 px | 44 × 44 px | theme `size: 'xl'` |
| `Burger` (1) | 28 × 28 px | 44 × 44 px | theme `size: 'lg'` |
| `Switch` (1) | 79.4 px tall (label with description) | 79.4 px tall | unchanged |

Targets below 44 px in height or width: 117 of 148 before, 0 of 148 after, measured again on the final build. The `PasswordInput` row measures its inner `input`, which sits inside the visible 50 px `lg` frame with a 1 px border above and below, so the README's 50 px is the frame the user sees and touches.

Text contrast with Mantine's default colors, the evidence for the departure in the README. The script read every visible element with its own text and every empty input's `::placeholder` on the version 6 build, composited the element's color and the backgrounds behind it, and applied the WCAG 2.x relative luminance formula. The final build has the same colors: its dimmed text measured the same ratios on every surface. 55 of 167 combinations of component kind, colors, and disabled state were below 4.5:1; 6 of the 55 are disabled text. The lowest per kind:

| Text | Light | Dark |
| --- | --- | --- |
| Dimmed text, `gray.6` / `dark.2` (page, card, lowest surface) | 3.32, 3.32, 2.62:1 | 4.04, 3.53, 2.87:1 |
| Mantine's gray labels and descriptions (`DataList`, `Menu` label, input and `Switch` descriptions, `Code`) | 3.15:1 | 3.53:1 |
| `Text` in a color, such as teal and orange | 2.55:1 | 4.5:1 or more |
| `Badge` label | 2.02:1 | 4.5:1 or more |
| `Alert` title and `Avatar` initials, light variant | 3.62:1 | 4.5:1 or more |
| `Button` label on filled orange, hovered | 3.04:1 | 4.30:1 |
| Required-field asterisk | 3.28:1 | 3.44:1 |
| `Menu.Item` "Sign out" (red) | 3.28:1 | 4.13:1 |
| `Breadcrumbs` separator | 4.5:1 or more | 4.04:1 |
| Input placeholder | 2.07:1 | 2.47:1 |
| Disabled text | 1.75:1 | 2.47:1 |

The hovered filled button was measured where the pointer rested after a click; no other hover or focus state is in these figures.

## Checks

- `npm run openspec -- validate align-ui-poc-with-design-rules --strict`: "Change 'align-ui-poc-with-design-rules' is valid".
- `npm run verify:comments`: "Every comment is within the comment length rule."
- `make verify` on the final commit: passed. Tests 1,733 with 1,731 passed, 2 skipped, and 0 failed; coverage of all files above 99% of lines, 91% of branches, and 98% of functions; strict OpenSpec validation 68 passed, 0 failed; every active change archives into strictly valid specs; packed file allowlist and installed CLI verification passed. `docs/ui-poc/` is outside the workspaces, so `make verify` neither builds nor tests it.

## Independent review

Assigned by the coordinator: Claude Code with `claude-opus-5-5`, effort high, in plan mode, run from the worktree as `claude -p "<prompt>" --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`.

- **Pass 1 — session `88de44d6-2f0d-4247-82ed-1c2434a0b847`, head `93c627b`.** The JSON `modelUsage` listed `claude-opus-5-5`, and `claude-haiku-5-5` for the CLI's internal helper calls. The snapshot was `da5af8a88b48f370e82d40337578b0e15f5356ca5a9533cbe7678a59365b118c` before and after the pass. Findings: 0 Critical, 1 High, 1 Medium, 5 Low, all accepted:
  1. High: the README claimed that all text meets 4.5:1, but only the dimmed color changed. First documented as a departure, then fixed for every text after the scope widening (`c324973`). With the owner's final decision the README claims no contrast and lists the default ratios as an open departure.
  2. Medium: the ADR 0011 consequence overclaimed and called the resolver a theme setting. It now says only that the targets were met, with the theme's default props and two call-site changes, and that contrast remains for item 28.
  3. Low: "Departures from 'only Mantine'" did not mention the resolver. The resolver is removed, so there is nothing to mention.
  4. Low: the README's "Design rules" named only `src/main.tsx`. It names `src/theme.ts` and the call sites in `src/screens/Board.tsx` and `src/screens/NewTask.tsx`.
  5. Low: the limitations treated other colors as unmeasured and disabled controls as exempt. Every visible text was measured, and the README lists disabled text among the departures without relying on an exemption.
  6. Low: `PasswordInput` measured 48 px here and 50 px in the README. A sentence under the target table explains the inner input and the 50 px frame.
  7. Low: a magic `- 6`. It is `TARGET_SIZE - 2 * SEGMENT_PADDING_Y`, with `SEGMENT_PADDING_Y = 3` commented as Mantine 9.7.3's default segment padding, in `src/theme.ts`.

- **Pass 2 — session `547536dc-592b-4d9f-9a98-aecf15e72264`, head `c324973`.** The JSON `modelUsage` listed only `claude-opus-5-5`. The snapshot was `60cfede4a640fc1369baefceefc4084d63984abfc7a78bd7e8d2301fa042ccbe` before and after the pass. The reviewer confirmed the pass-1 resolutions, with caveats in M1 and L4. Findings: 0 Critical, 0 High, 2 Medium, 7 Low. Resolved after the owner's final decision; these resolutions are unreviewed:
  1. Medium M1: in the dark scheme the "Sign out" menu item's hover and keyboard-active text, `red.4` from `c="red"`, was 3.90:1 on the red light-hover background; the worker's hover and keyboard measurement confirmed it. Resolved by removal: `c="red"` and the resolver are gone, and contrast is deferred to item 28.
  2. Medium M2: `design.md` claimed that the `cssVariablesResolver` is within D17, while the README listed it as a departure. The owner first kept the mechanism, then decided that Mantine's colors are not overridden; the resolver is removed, and `design.md` records the decision.
  3. Low L1: the comment and `design.md` said that `Menu.Item` shade 6 is below 4.5:1 in both schemes. Resolved by removal of the comment and the call-site prop.
  4. Low L2: a surface was named "orange filled" though it is the dark orange light-variant background. Resolved by removal of the per-surface dimmed table.
  5. Low L3: whether the six disabled kinds are among the 55 was unclear. The contrast paragraph now says they are.
  6. Low L4: "three call-site props" was inaccurate. The README, the ADR, and `design.md` name the call-site changes; pass 3 found the `Burger` change missing, see pass 3, finding 1.
  7. Low L5: the resolver's comment described only the dimmed color. Resolved by removal.
  8. Low L6: `DIMMED_TEXT` contained the error color. Resolved by removal.
  9. Low L7: a parameter shadowed the exported `theme`, and the theme imported `TARGET_SIZE` from `ui.tsx`. The helpers are removed, and `TARGET_SIZE` lives in `src/theme.ts`, which imports only Mantine.

- **Pass 3 — session `e8a8f5ed-34c9-43eb-a365-1691e49d3a2d`, head `32f9261`.** The JSON `modelUsage` listed `claude-opus-5-5`, and `claude-haiku-5-5` for the CLI's internal helper calls. The snapshot was `2a8f54124d1aac56e6a5c7466796821766b474ca568d68202f9a40881e645ea9` before and after the pass. The reviewer confirmed the pass-1 and pass-2 resolutions, except pass-2 L4 in part (finding 1 below). Findings: 0 Critical, 0 High, 0 Medium, 9 Low. Because the pass found only Low findings, they were fixed without another review pass, as the review process allows; these fixes are unreviewed:
  1. The removal of `size="sm"` from the header's `Burger` in `src/main.tsx` was undocumented. The README, ADR 0011, `design.md`, and `proposal.md` now name three call-site changes.
  2. The ADR said only that "the contrast departure remains". It now says that text contrast below 4.5:1 in both color schemes, for several of Mantine's default colors, remains for item 28.
  3. The ADR's "only Mantine" consequence missed the style props for touch targets. It now names them in the theme's default props and at two board call sites.
  4. The README's "Departures from 'only Mantine'" missed the two board call-site `mih` props. Added.
  5. Hover-only tooltip badges were not counted as targets. The README and the measurement now claim 44 px for controls only, and the badges are under Limitations and a remaining gate for item 28.
  6. The README did not say where the contrast figures were measured. It names the version 6 build, whose colors this source keeps, and resting states.
  7. The republication of version 7: the coordinator publishes it before the handoff; the line under "Scope and source" records it.
  8. `design.md` said that the sizes do not enlarge the text, but `lg` inputs enlarge their text, label, and description. Corrected there and in the README.
  9. `src/theme.tsx` holds no JSX. It is renamed to `src/theme.ts`, with the imports and documents updated.

## Limitations

- The measurements count each control kind and text once; repeated controls with the same text, such as the cards' "Open session", are assumed to share the first one's size, which the theme makes true by construction.
- Badges that only show a tooltip on hover, the later-gate marker (`src/ui.tsx`) and the live status (`src/screens/LiveStatus.tsx`), are not focusable and were not counted; they stay smaller than 44 px, and item 28 decides whether they count as targets.
- The contrast figures come from the screens' resting states; hover, focus, and pressed states were not measured systematically on the final build.
- The measurements ran in one desktop Chrome at 1600 × 1000 and, for the navbar, 390 × 844; no other browser or touch device was used.
- The segment line height relies on Mantine 9.7.3's default `SegmentedControl` padding of 3 px.

## Remaining gates

- Item 28: text contrast of at least 4.5:1, open in the proof of concept with Mantine's default colors, and whether hover-only tooltip badges count as targets.
- Coordinator integration into `dev`, archive, and the republication of the artifact as version 7.
