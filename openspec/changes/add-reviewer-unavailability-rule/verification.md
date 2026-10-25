# Verification: add-reviewer-unavailability-rule

## Scope and source

Owner request of 2026-10-25, given here in English: when a reviewer is unavailable for any reason, it is not used for the next 30 minutes, and the next one is proposed. The owner then asked to bring the documents and the project skill in line with the rule. The coordinator developed this change itself, following the worker steps. Base revision: `da3040c` on `dev`. Prepared in the git worktree `../taskelith-worktrees/add-reviewer-unavailability-rule`.

Changed:

- `docs/governance.md`: the rule "Unavailable reviewer", a sentence in "One reviewer per task", and the date note of the rule list.
- `docs/agent-task-protocol.md`: coordinator step 1 and the reviewer invocations.
- `.claude/skills/taskelith-task-protocol/SKILL.md`: one paragraph pointing to the rule.
- The `review-process` delta: "Authorized single-reviewer review" (467 characters) is modified, and "Unavailable reviewer" (415 characters) is added.

## Author self-check before review

- The rule follows the owner's wording: unavailable for any reason, not used for 30 minutes, and the next reviewer is proposed. The examples are not a closed list.
- One reviewer at a time, the ban on cross-review, and the three-pass cap are unchanged. The pass count carries over across a switch.
- The four places agree. All content is English. The change adds no external link, so the evidence check has nothing to pin.

## Checks

Node v24.22.1, in the worktree:

- `npm run openspec -- validate add-reviewer-unavailability-rule --strict` passed.
- `make verify` passed at `46a28ed` before pass 1: 728 tests passed, 0 failed.

## Independent review

Reviewer: Codex CLI, assigned by rotation, invoked as `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`. The prompt and log are kept outside the worktree.

### Pass 1

Session `01a172a2-0713-75e3-afc0-12c7aeacdabe`, model `gpt-6.1-sol` confirmed in the output header, at `46a28ed`. The SHA-256 snapshots before and after were equal.

Findings: Critical 0, High 0, Medium 4, Low 1.

1. Medium: an automatic switch went beyond the owner's "propose the next one". Fixed: the next reviewer is proposed by the worker, and the coordinator assigns it.
2. Medium: the existing requirement and its scenario still banned another reviewer unconditionally. Fixed with a MODIFIED delta that allows only an unavailable reviewer's replacement and keeps the ban on cross-review.
3. Medium: the reasons were a closed list, and the rule applied only to an assigned reviewer. Fixed: the reasons are examples, and the exclusion applies whether or not the reviewer is assigned. A scenario covers assignment.
4. Medium: there was no `verification.md` before the pass. Fixed with this record.
5. Low: the rule list's date note said 2026-10-24 for every rule. Fixed.

## Remaining gates

Pass 2 confirms the pass 1 fixes. Then integration into `dev` and the archive by the coordinator. Promotion to `main` is a separate owner decision.
