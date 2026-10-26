# Verification: align-ui-poc-with-design-rules

## Scope and source

Source: on 2026-10-26 the owner asked for the two departures listed in `docs/ui-poc/README.md` under "Departures from the product UI specification" to be fixed: touch targets below 44 px and light-scheme dimmed text below 4.5:1, using only Mantine's own theme settings (G3 decision D17, ADR 0011). The coordinator assigned the task to a worker subagent on the same day and added four requirements: before-and-after measurements per control kind, the reasoning for `skip_specs` in `design.md`, the republication authorization below, and the assigned reviewer.

Base revision: `64155ab` on `dev`. Prepared in the git worktree `../taskelith-worktrees/align-ui-poc-with-design-rules` on branch `align-ui-poc-with-design-rules`. Scope: `docs/ui-poc/src/main.tsx`, `src/ui.tsx`, `src/screens/Board.tsx`, `src/screens/NewTask.tsx`, `docs/ui-poc/README.md`, one consequence in `docs/decisions/0011-mantine-ui-proof-of-concept.md`, and this change.

Outside the repository: republishing the proof of concept as version 7 of the private artifact `M8VnvLLCrAMiBPrkKezGzk` was authorized by the owner's direct assignment of this task on 2026-10-26. The coordinator publishes it; this change records the build that version 7 is to match.

## Environment

macOS 26.6.2 (Darwin 25.6.0, x86_64), Node.js v24.22.1 and npm 12.2.1 selected by `nvm use` from `.nvmrc`. The proof of concept was built as its README says, in a `mktemp -d` scratch copy outside the repository with the pinned `react@19.2.8`, `react-dom@19.2.8`, `@mantine/core@9.7.3`, `@mantine/hooks@9.7.3`, `esbuild@0.28.2`, `typescript@7.0.2`, `@types/react@19.3.0`, and `@types/react-dom@19.3.0`. Measurements ran in headless Google Chrome 155.0.8059.86 through `playwright-core@1.56.1`, installed in a separate scratch directory; nothing was installed into the repository.

## Author self-check before review

- Only Mantine: the change uses the theme's `components` default props, Mantine sizes, Mantine style props (`mih`, `miw`, `lh`, `display`), and the `MantineProvider` `cssVariablesResolver`. It adds no CSS, no `styles`, `classNames`, or `vars`, and no component.
- The rebuild of the unchanged source at `64155ab` reproduced version 6 byte for byte: 920,512 bytes, SHA-256 `8791c89f4997a5a1afcb9354a03a8a7f4606cf0fd16f2011c693062f75310282`. That build is the "before" of the measurements.
- The new build is 921,275 bytes with SHA-256 `2c57b5b4a9833a11d91a79804f77df2e38731c918e6a66141da96d60653378a2`; `tsc -p .` passed on the reference source. After the coordinator's check, two whitespace-only lines left in JSX by the removed `h={44}` props were deleted and `TARGET_SIZE` was moved above the `LaterGate` comment; the rebuild from that final source gave the same size and SHA-256, because esbuild drops whitespace and comments.
- Screenshots of the board, the session screen, and the new task screen at 1600 × 1000 in the dark scheme show no clipped or overlapping control.
- Comment rule: the three new comments are one line each and within 80 characters; `npm run verify:comments` passed.
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
| `PasswordInput` (1) | 34 px tall | 48 px tall | theme `size: 'lg'` |
| `CloseButton` (1) | 28 × 28 px | 44 × 44 px | theme `size: 'xl'` |
| `Burger` (1) | 28 × 28 px | 44 × 44 px | theme `size: 'lg'` |
| `Switch` (1) | 79.4 px tall (label with description) | 79.4 px tall | unchanged |

Targets below 44 px in height or width: 117 of 148 before, 0 of 148 after.

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

## Checks

- `npm run openspec -- validate align-ui-poc-with-design-rules --strict`: "Change 'align-ui-poc-with-design-rules' is valid".
- `npm run verify:comments`: "Every comment is within the comment length rule."
- `make verify`: passed. Tests 1,733 with 1,731 passed, 2 skipped, and 0 failed; coverage of all files 99.27% lines, 91.90% branches, 98.88% functions; strict OpenSpec validation 68 passed, 0 failed; every active change archives into strictly valid specs; packed file allowlist and installed CLI verification passed. `docs/ui-poc/` is outside the workspaces, so `make verify` neither builds nor tests it.

## Independent review

Assigned by the coordinator: Claude Code with `claude-opus-5-5`, effort high, in plan mode. Passes: pending.

## Limitations

- The measurements count each control kind and text once; repeated controls with the same text, such as the cards' "Open session", are assumed to share the first one's size, which the theme makes true by construction.
- Only dimmed text was measured and changed. Other text colors, such as placeholders (`gray.5` in the light, `dark.3` in the dark scheme) and colored status text, were not measured; disabled controls are exempt from the contrast requirement under WCAG.
- The measurements ran in one desktop Chrome at 1600 × 1000 and, for the navbar, 390 × 844; no other browser or touch device was used.
- The segment line height relies on Mantine 9.7.3's default `SegmentedControl` padding of 3 px.

## Remaining gates

- Independent review by the assigned reviewer.
- Coordinator integration into `dev`, archive, and the republication of the artifact as version 7.
