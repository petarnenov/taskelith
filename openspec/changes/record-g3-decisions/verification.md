# Verification: record-g3-decisions

## Scope and source

Follow-up to `draft-g3-plan` (PR #151), started on 2026-10-25 on the owner's instruction to run another review cycle, and reported to the coordinator (Niki). Base revision: `018d533` on `dev`. Scope: `docs/g3-plan.md` and this change. Prepared in the git worktree `../taskelith-worktrees/record-g3-decisions` on branch `record-g3-decisions`. Source: the owner's decisions in the project conversation on 2026-10-25, given one group at a time in answer to the options and recommendations of the draft plan: D2 (a), D3 (a), D4 (a), D5 (a), D6 (a), D7 (a), D8 (a), D9 (a), D10 (a), D11 (b), D12 (a), D13 (c), D14 (a), D16 (a), and the new D18 (a). D15 stays open.

The change adds no requirement: the `delivery-planning` requirement "Owner decisions recorded in the plan" applies, so `.openspec.yaml` sets `skip_specs: true`.

## Author self-check before review

- Each decided row names the date and the chosen option and keeps the options and rationale; D13 states that the owner chose against the recommendation. No item lists a decided decision under "Blocked by"; only D15 remains, on items 35 and 36.
- D13 (c) is covered by items 38 to 40 and by widened items 1, 3, 9, 18, and 41; D18 records the terminal exception to D17, which the owner chose after the author raised the conflict.
- Evidence check: the change adds no external link; the relative links and anchors of the plan are unchanged.

## Checks

In the worktree, Node v24.22.1, before the first review pass: `npm run openspec -- validate record-g3-decisions --strict` passed; a script recomputed the waves from the "Depends on" column (12 waves, all matching) and checked that every decision in a "Blocked by" entry lists that item under "Applies to" (no mismatch); `make verify` passed (strict OpenSpec validation 50 passed, 0 failed; archive dry run and package verification passed).

## Independent review

Reviewer: Codex (`gpt-6.1-sol`), reasoning effort medium, read-only sandbox, run from the worktree as `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, with the prompt and log outside the worktree.

## Limitations

- The plan remains a draft that the G2 closure may change.
- xterm.js, node-pty, and Mantine are not yet evaluated; item 1 does that.

## Remaining gates

- Independent review.
- Coordinator integration into `dev` and archive.
- The owner's decision D15 after item 2.
