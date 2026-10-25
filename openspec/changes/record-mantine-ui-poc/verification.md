# Verification: record-mantine-ui-poc

## Scope and source

Started on 2026-10-25 by the UI worker (Desi) on the owner's request in the project conversation, to be handed to the coordinator (Niki). Base revision: `9bb8013` on `dev`. Prepared in the git worktree `../taskelith-worktrees/record-mantine-ui-poc` on branch `record-mantine-ui-poc`. Scope: ADR 0011, the amendment notes in ADR 0008, item 28 and a note under the decisions table in `docs/g3-plan.md`, `docs/ui-poc/`, and this change, with the `product-ui` requirement "Reference proof of concept".

Source: on 2026-10-25 the owner asked for the UI proof of concept to be reworked to use only Mantine (D17), chose a new interactive build with real Mantine components over a restyled canvas, and then asked to record it as the official proof of concept and the basis of item 28, to mark the old canvas as superseded, and to share the link with the other sessions. Asked whether to store the source, the owner chose to store it in the repository as reference material. During pass 1 the owner asked what the "PP" avatar shows and why there is no sign-out; the proof of concept gained an account menu with "Sign out" and a sign-in screen.

Outside the repository: the Mantine build is published as the private artifact `M8VnvLLCrAMiBPrkKezGzk` (version 2 matches `docs/ui-poc/`), and the old canvas `Q84QABcHZZ1ow9B7UcZdNS` was retitled "Taskelith UI POC (superseded)" with a note naming the new artifact (canvas version 29).

## Author self-check before review

- ADR 0011 keeps every ADR 0008 decision and changes only its storage consequence, which ADR 0008's status and consequence now name.
- `docs/ui-poc/` has no `package.json` or lockfile and lies outside `tsconfig.check.json`, the workspaces, the coverage scope (`dist/` only), and the package `files` list.
- The README rebuild was run from a fresh scratch copy (`mktemp -d`) with the pinned versions and Node.js 24.22.1: `tsc -p .` passed and the output was byte-identical to the published build (SHA-256 `85c3e6f2…c791`, 901,446 bytes).
- The proof of concept was checked in a browser (Playwright, 1440 × 900 and 390 × 844): all ten screens render without console errors, no page scrolls horizontally at 390 px, and "Sign out" leads to the sign-in screen and back.
- Evidence check: the two artifact links are marked as unversioned private pages; all other links are relative.

## Checks

In the worktree, Node v24.22.1, before pass 1 and again after the pass-1 fixes: `npm run openspec -- validate record-mantine-ui-poc --strict` passed; `make verify` passed (strict OpenSpec validation 50 passed, 0 failed; archive dry run and package verification passed).

## Independent review

Reviewer: Claude Code with `claude-fable-5-1`, effort medium, run from the worktree as `claude -p "<prompt>" --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, with the prompt and output outside the worktree.

- **Pass 1 — session `61e3569d-0651-489d-a411-7c016074af96`, head `0c2529b`.** The JSON `modelUsage` confirmed `claude-fable-5-1`; the snapshot (`git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256`) was `04aeeba3…233d` before and after the pass. The reviewer confirmed that the reference source cannot reach the typecheck, coverage, dependency inventory, or package, and that the pinned versions exist. Findings: 0 Critical, 0 High, 2 Medium, 17 Low. All accepted and resolved (unreviewed until pass 2):
  1. Medium: the requirement's main SHALL had no scenario. Added "Screen built from the proof of concept".
  2. Medium: the source departs from "Design rules" (targets below 44 px, light dimmed text below 4.5:1) without a record. The README lists both under "Departures from the product UI specification", and an ADR 0011 consequence states that the requirement wins and item 28 meets it with theme settings.
  3. Low: esbuild was said to be evaluated by item 1. The proposal and ADR 0011 now say it is only the reference bundler and not proposed.
  4. Low: "admitted" by item 1. Now "qualified by item 1 and admitted by the dependency policy".
  5. Low: items 29 to 34 and 40 did not match the screens. ADR 0011 now names the UI items that build a shown screen, item 40 without one, and the D10 gates.
  6. Low: non-deterministic rebuild steps. The README uses `mktemp -d` and pins TypeScript and the React types.
  7. Low: truncated digest. The README gives the full SHA-256.
  8. Low: "self-contained" despite Google Fonts. The README states the font request and the offline fallback.
  9. Low: `legalComments: 'none'` dropped license notices. Now `'eof'`.
  10. Low: unlabeled external links. Marked as unversioned private pages.
  11. Low: D1 and D17 referred to the old canvas. A note under the decisions table names ADR 0011.
  12. to 19. Low, reference source: merged duplicate imports (`Inbox.tsx`); imported `ReactNode` instead of the global `React` namespace (`main.tsx`, `BoardDrawers.tsx`); cleared the session stop timer and expired board timers; replaced the nested ternary with `verifyStateOf`; named `MERGE_GATE_POSITION`; formatted the source with Prettier 3.6.2 at 110 columns (only single prose strings stay longer); derived `Screen` from one `SCREENS` list; removed the heading inside the card's button.

  Out of scope, noted by the reviewer: the comment-length rule and `scripts/check-comment-length.ts` do not cover `.tsx`; item 28 should extend them before the source becomes product code.

## Limitations

- The proof of concept uses static sample data; only navigation, the board flow, approvals, and sign-out are simulated.
- The light color scheme was checked only for rendering, not for contrast beyond the departure recorded above.
- Sharing the artifacts is the owner's action from the Share menu; the sessions were sent the link.

## Remaining gates

- Coordinator integration into `dev` and archive.
