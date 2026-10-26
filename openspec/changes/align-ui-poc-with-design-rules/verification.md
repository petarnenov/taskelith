# Verification: align-ui-poc-with-design-rules

## Scope and source

Source: on 2026-10-26 the owner asked for the two departures listed in `docs/ui-poc/README.md` under "Departures from the product UI specification" to be fixed: touch targets below 44 px and light-scheme dimmed text below 4.5:1, using only Mantine's own theme settings (G3 decision D17, ADR 0011). The coordinator assigned the task to a worker subagent on the same day and added four requirements: before-and-after measurements per control kind, the reasoning for `skip_specs` in `design.md`, the republication authorization below, and the assigned reviewer.

Scope widening: after review pass 1, on 2026-10-26, the owner widened the scope through the coordinator. Every text in both color schemes, including colored text, `Anchor` text, placeholders, and text on filled buttons and badges, must reach 4.5:1 on its actual background, with Mantine's theme settings only; the measurement covers all visible text, not only dimmed text.

Base revision: `64155ab` on `dev`. Prepared in the git worktree `../taskelith-worktrees/align-ui-poc-with-design-rules` on branch `align-ui-poc-with-design-rules`. Scope: `docs/ui-poc/src/theme.tsx` (new, moved out of `src/main.tsx`), `src/main.tsx`, `src/ui.tsx`, `src/screens/Board.tsx`, `src/screens/NewTask.tsx`, `docs/ui-poc/README.md`, one consequence in `docs/decisions/0011-mantine-ui-proof-of-concept.md`, and this change.

Outside the repository: republishing the proof of concept as version 7 of the private artifact `M8VnvLLCrAMiBPrkKezGzk` was authorized by the owner's direct assignment of this task on 2026-10-26. The coordinator publishes it; this change records the build that version 7 is to match.

## Environment

macOS 26.6.2 (Darwin 25.6.0, x86_64), Node.js v24.22.1 and npm 12.2.1 selected by `nvm use` from `.nvmrc`. The proof of concept was built as its README says, in a `mktemp -d` scratch copy outside the repository with the pinned `react@19.2.8`, `react-dom@19.2.8`, `@mantine/core@9.7.3`, `@mantine/hooks@9.7.3`, `esbuild@0.28.2`, `typescript@7.0.2`, `@types/react@19.3.0`, and `@types/react-dom@19.3.0`. Measurements ran in headless Google Chrome 155.0.8059.86 through `playwright-core@1.56.1`, installed in a separate scratch directory; nothing was installed into the repository.

## Author self-check before review

- Only Mantine: the change uses the theme's `primaryShade`, `autoContrast`, `luminanceThreshold`, and `components` default props, Mantine sizes, Mantine style props (`mih`, `miw`, `lh`, `display`, `c`), Mantine's `Text`, `darken`, and `luminance`, and the `MantineProvider` `cssVariablesResolver`. It adds no CSS, no `styles`, `classNames`, or `vars`, and no component.
- The rebuild of the unchanged source at `64155ab` reproduced version 6 byte for byte: 920,512 bytes, SHA-256 `8791c89f4997a5a1afcb9354a03a8a7f4606cf0fd16f2011c693062f75310282`. That build is the "before" of the measurements.
- The new build is 921,275 bytes with SHA-256 `2c57b5b4a9833a11d91a79804f77df2e38731c918e6a66141da96d60653378a2`; `tsc -p .` passed on the reference source. After the coordinator's check, two whitespace-only lines left in JSX by the removed `h={44}` props were deleted and `TARGET_SIZE` was moved above the `LaterGate` comment; the rebuild from that final source gave the same size and SHA-256, because esbuild drops whitespace and comments. After the pass-1 fixes, which name the segment padding as a constant, the build is 921,283 bytes with SHA-256 `66469fbd8aaf76b648a4cf5fd56efd80a94dfe6aebb9d7687a20ffe2fb000443`, and a new measurement again found 0 of 148 targets below 44 px. After the scope widening the build is 922,082 bytes with SHA-256 `00a0c26920f8a36907fd5ae7a10b577a76a06dbbeca4ff83226a0a29e60bee32`, version 7's build; the measurements below marked "after" ran on that file.
- Screenshots of the board, the session screen, and the new task screen at 1600 × 1000 in the dark scheme, and of the board and the inbox in the light scheme, show no clipped or overlapping control and no unreadable text.
- Comment rule: every new comment has at most two lines of at most 80 characters; `npm run verify:comments` passed.
- Evidence check: no new external link. The artifact link in the README stays marked as an unversioned private page.

## Measurements

Method: a script loads the build at 1600 × 1000, opens every screen from the header navigation and the "Needs you" button, every board card's drawer (expanding "Reconcile…" where present), the auto-merge settings drawer, the worker enrollment panel, every board state, the new task screen before and after creating a task, and the account menu, in the dark and then the light scheme; then the phone navbar at 390 × 844 and the sign-in screen. It measures the bounding box of every `button`, `a[href]`, visible input, `textarea`, and `menuitem`; for a visually hidden radio or checkbox it measures the label that takes the click. Targets are counted once per component kind and text, 148 in each build.

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

Targets below 44 px in height or width: 117 of 148 before, 0 of 148 after. The `PasswordInput` row measures its inner `input`, which sits inside the visible 50 px `lg` frame with a 1 px border above and below, so the README's 50 px is the frame the user sees and touches.

Dimmed text contrast, measured: the script reads the computed color of every visible element styled with the dimmed color and composites the backgrounds behind it, then applies the WCAG 2.x relative luminance formula. Ratios per surface:

| Scheme | Surface | Before (`gray.6` `#868e96` / `dark.2` `#828282`) | After (`gray.7` `#495057` / `dark.1` `#b8b8b8`) |
| --- | --- | --- | --- |
| Light | white `#ffffff` (1,453 elements) | 3.32:1 | 8.18:1 |
| Light | `gray.0` `#f8f9fa` | 3.15:1 | 7.76:1 |
| Light | orange light `rgb(255, 232, 204)` | 2.79:1 | 6.88:1 |
| Light | indigo light `rgb(219, 228, 255)` (current stage row) | 2.62:1 | 6.45:1 |
| Dark | body `dark.7` `#242424` (491 elements) | 4.04:1 | 7.83:1 |
| Dark | card `dark.6` `#2e2e2e` (961 elements) | 3.53:1 | 6.85:1 |
| Dark | indigo light `rgb(27, 40, 100)` | 3.56:1 | 6.90:1 |
| Dark | `dark.5` `#3b3b3b` | 2.91:1 | 5.65:1 |
| Dark | orange filled `rgb(109, 36, 8)` | 2.87:1 | 5.55:1 |

The lowest ratio after the change is 6.45:1 in the light scheme and 5.55:1 in the dark scheme. `gray.6` and `dark.2` fail on every surface; `gray.7` and `dark.1` are the next palette shades and pass on all of them.

All text contrast, measured after the scope widening: the same script, on the same screens and states in both schemes, reads every visible element with its own text and every empty input's `::placeholder`, composites the element's color and the backgrounds behind it, and applies the same formula. Before: 55 of 167 text kinds (component kind, colors, and disabled state) were below 4.5:1, and 6 disabled ones. After: 0 of 166, and 0 disabled. Lowest ratio per component kind:

| Text kind | Light before | Light after | Dark before | Dark after |
| --- | --- | --- | --- | --- |
| `Alert` title | 3.62:1 | 5.18:1 | 10.14:1 | 10.14:1 |
| `Avatar` initials | 3.62:1 | 5.18:1 | 10.14:1 | 10.14:1 |
| `Badge` label | 2.02:1 | 4.98:1 | 7.02:1 | 8.06:1 |
| `Breadcrumbs` separator | 8.18:1 | 8.18:1 | 4.04:1 | 7.83:1 |
| `Button` label | 3.04:1 | 4.77:1 | 4.30:1 | 4.98:1 |
| `Button` label, disabled | 1.75:1 | 6.90:1 | 2.47:1 | 6.85:1 |
| `Code` | 3.15:1 | 7.76:1 | 3.53:1 | 6.85:1 |
| `DataList` | 3.32:1 | 8.18:1 | 3.53:1 | 6.85:1 |
| `EmptyState` description | 3.32:1 | 8.18:1 | 4.04:1 | 7.83:1 |
| Input label (required asterisk) | 3.28:1 | 6.98:1 | 3.44:1 | 6.70:1 |
| Input and `Switch` description | 3.32:1 | 8.18:1 | 4.04:1 | 7.83:1 |
| `Menu` label | 3.32:1 | 8.18:1 | 3.53:1 | 6.85:1 |
| `NavLink` label | 5.34:1 | 6.17:1 | 9.37:1 | 9.37:1 |
| `SegmentedControl` label | 7.35:1 | 7.35:1 | 8.31:1 | 8.31:1 |
| `SegmentedControl` label, disabled | 1.87:1 | 7.35:1 | 3.00:1 | 8.31:1 |
| `Text` and text in a `Stack` | 2.55:1 | 4.98:1 | 2.87:1 | 4.58:1 |
| `UnstyledButton` and `Menu.Item` | 3.28:1 | 6.90:1 | 4.13:1 | 5.65:1 |
| `Menu.Item`, disabled | 2.07:1 | 8.18:1 | 2.47:1 | 6.85:1 |
| Input placeholder | 2.07:1 | 8.18:1 | 2.47:1 | 6.85:1 |
| Titles, alerts, lists, `Switch` and `EmptyState` titles | at least 17.67:1 | unchanged | at least 8.20:1 | unchanged |

The `Breadcrumbs` separator is counted under `Text` after the change, because it is now a `Text`; its after values are those of the dimmed color. The lowest ratio after the change is 4.77:1 in the light and 4.58:1 in the dark scheme.

States the page does not show by itself were checked against Mantine 9.7.3's palette with Mantine's `luminance`, because the script hovers no control on purpose. With `primaryShade` 7 and the threshold 0.179, the text that `autoContrast` picks on filled gray, indigo, orange, red, and teal reaches 8.18, 4.98, 6.90, 5.46, and 6.74:1 on shade 7 and 11.51, 5.67, 5.87, 4.65, and 5.32:1 on the hover shade 8. The light-scheme ink is chosen to reach 4.5:1 on shade 2, the light and subtle variants' hover background. In the dark scheme the light variant's text, shade 0, reaches at least 6.91:1 on its hover background.

## Checks

- `npm run openspec -- validate align-ui-poc-with-design-rules --strict`: "Change 'align-ui-poc-with-design-rules' is valid".
- `npm run verify:comments`: "Every comment is within the comment length rule."
- `make verify`: passed. Tests 1,733 with 1,731 passed, 2 skipped, and 0 failed; coverage of all files 99.27% lines, 91.89% to 91.90% branches across the runs, 98.88% functions; strict OpenSpec validation 68 passed, 0 failed; every active change archives into strictly valid specs; packed file allowlist and installed CLI verification passed. `docs/ui-poc/` is outside the workspaces, so `make verify` neither builds nor tests it.

## Independent review

Assigned by the coordinator: Claude Code with `claude-opus-5-5`, effort high, in plan mode, run from the worktree as `claude -p "<prompt>" --model claude-opus-5-5 --effort high --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json < /dev/null`.

- **Pass 1 — session `88de44d6-2f0d-4247-82ed-1c2434a0b847`, head `93c627b`.** The JSON `modelUsage` listed `claude-opus-5-5`, and `claude-haiku-5-5` for the CLI's internal helper calls. The snapshot was `da5af8a88b48f370e82d40337578b0e15f5356ca5a9533cbe7678a59365b118c` before and after the pass. Findings: 0 Critical, 1 High, 1 Medium, 5 Low. All accepted and resolved, unreviewed until pass 2:
  1. High: the README claimed that all text meets 4.5:1, but only the dimmed color changed, and Mantine's other text colors stay below it in the light scheme, as do placeholders and white text on filled orange and teal. First resolved by documenting the other colors as a departure for item 28; after the owner's scope widening, fixed instead: `primaryShade` 7, `autoContrast` with a `luminanceThreshold` of 0.179, the resolver's light-scheme inks and placeholder, disabled, and error colors, the dimmed `Breadcrumbs` separator, and `c="red"` on "Sign out" bring every measured text to 4.5:1 in both schemes, and the README claims it as far as the measurement reached.
  2. Medium: the ADR 0011 consequence overclaimed and called the resolver a theme setting, though it is a `MantineProvider` prop, and missed the call-site props. It now says that the change met both rules, as far as its measurement of every screen in both color schemes reached, with Mantine's theme settings, its CSS variables resolver, and three call-site props, and points to the README.
  3. Low: "Departures from 'only Mantine'" did not mention that the resolver rewrites `--mantine-color-dimmed`. It now names every variable the resolver rewrites and the `Breadcrumbs` separator default, with item 28 deciding whether they stay within D17.
  4. Low: the README's "Design rules" named only `src/main.tsx`. It names `src/theme.tsx`, where the theme now lives, and the call sites in `src/screens/Board.tsx`, `src/screens/NewTask.tsx`, and `src/main.tsx`.
  5. Low: the limitations said that other colors were not measured and treated disabled controls as exempt. Every visible text, placeholders and disabled text included, is now measured in the browser before and after, and disabled text meets 4.5:1 too, so no exemption is relied on.
  6. Low: `PasswordInput` measured 48 px here and 50 px in the README. A sentence under the target table explains the inner input and the 50 px frame.
  7. Low: a magic `- 6` in `src/main.tsx`, now in `src/theme.tsx`. It is `TARGET_SIZE - 2 * SEGMENT_PADDING_Y`, with `SEGMENT_PADDING_Y = 3` commented as Mantine 9.7.3's default segment padding.

## Limitations

- The measurements count each control kind and text once; repeated controls with the same text, such as the cards' "Open session", are assumed to share the first one's size, which the theme makes true by construction.
- Text contrast was measured on the states the screens show without hovering, focusing, or pressing a control; hover colors were computed from the palette, and focus rings, selection, and tooltips were not checked. Text drawn over images or gradients does not occur and would not be measured correctly.
- The text measurement counts each combination of component kind, colors, and disabled state once, with its lowest ratio.
- The measurements ran in one desktop Chrome at 1600 × 1000 and, for the navbar, 390 × 844; no other browser or touch device was used.
- The segment line height relies on Mantine 9.7.3's default `SegmentedControl` padding of 3 px.

## Remaining gates

- Independent review pass 2 by the assigned reviewer.
- Coordinator integration into `dev`, archive, and the republication of the artifact as version 7.
