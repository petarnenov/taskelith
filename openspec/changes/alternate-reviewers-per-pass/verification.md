# Verification: alternate-reviewers-per-pass

## Scope and source

Coordinator brief from Niki, owner-approved on 2026-10-27 ("одобрявам смесен вариант"): replace "One reviewer per task" with two alternating reviewers per task, reviewer A for the full pass 1 and the confirmation-only pass 3, and reviewer B, of a different harness, for the full, independent pass 2 that also checks the pass 1 fixes. Developed by a subagent briefed and checked by the coordinator session, under [subagent execution](../../../docs/agent-task-protocol.md#subagent-execution), in the git worktree `../taskelith-worktrees/alternate-reviewers-per-pass` on branch `alternate-reviewers-per-pass`. Base revision: `744689cb` on `dev`. Scope: `docs/governance.md`, `docs/agent-task-protocol.md`, the `taskelith-task-protocol`, `taskelith-worker`, and `taskelith-coordinator` skills, the review line of `AGENTS.md`, the `review-process` delta, and a check of the findings tooling. Exclusions: review-pass statistics (a later `review-pass-statistics` change), the UI POC badge, and the findings schema and scripts, which need no change (`design.md`). Commit type `docs`: nothing here is in the published package's `files` allowlist.

## Revision

Rule text and change records: `52049334` and `8914f3dc` on base `744689cb`; this record is in the following commit.

## Environment

macOS 26.6.2 (Darwin 25.6.0, x86_64), Node.js v24.22.1 from `.nvmrc`.

## Author self-check

Against the review checklist of the brief (`make findings ARGS="checklist --capability review-process --files docs/**,.claude/**"`) and ADR 0004:

1. Redaction: no credential, token, or local path beyond the repository's worktree convention is added; `findings.jsonl` is empty.
2. Contract drift: governance, the protocol, the three skills, `AGENTS.md`, and the delta state the same rule. The author searched for `one reviewer`, `reviewer per task`, `same reviewer`, `cross-review`, and `assigned reviewer` across `docs/`, `.claude/`, `AGENTS.md`, and `openspec/specs/`. Remaining hits: the version 4 rule kept for tasks already under it, the living `review-process` Purpose (see Limitations), the `agent-task-protocol` spec's "assigned reviewer" of a returned branch, which governance now defines as reviewer A, and the UI POC badge (excluded).
3. Docs: links resolve to existing anchors (`governance.md#independent-review-process`); every new governance entry names its source and date.
4. Error handling: the unavailable-reviewer path is defined for A and for B, with the harness constraint and the scope of each role's remaining passes.
5. Evidence mismatch: the tooling evidence in `design.md` cites file and line of the current tree; the results below come from the commands listed.

Evidence check: no external link is added.

## Checks

- `npm run openspec -- validate alternate-reviewers-per-pass --strict`: `Change 'alternate-reviewers-per-pass' is valid`.
- `npm run verify:comments`: `Every comment is within the comment length rule.`
- `npm run findings -- validate`: `Every findings file is valid: 11 file(s).`
- Requirement bodies: "Authorized alternating reviewers" 476, "Unavailable reviewer" 471, "Rotation order" 489, and "Changes under the one-reviewer rule" 388 characters.
- Archive test in a scratch copy of the worktree: `npm run openspec -- archive alternate-reviewers-per-pass --yes` applied 1 added, 3 modified, and 1 renamed requirement to `review-process`; `npm run openspec -- validate --all --strict --no-interactive` then reported 69 passed, 0 failed.
- The findings tests were not run, because the findings tooling is unchanged.

## Independent review

Pending. Reviewer A: OpenCode CLI, `opencode-go/kimi-k3.1-pro#high`. Reviewer B, if pass 2 is needed: Codex CLI, `gpt-6.1-sol`. This change pilots the new scheme.

## Limitations

- The Purpose of the living `review-process` spec still says "one reviewer per change at a time": the archive test confirmed that the pinned OpenSpec archive leaves it unchanged.
- `make verify` has not been run yet.

## Remaining gates

- `make verify`.
- Independent review.
- Archive.
- Integration into dev by the coordinator (single pull request).
