# Verification

Date: 2026-10-28. The author's verification is recorded below; `make verify` and the review passes follow.

## Scope and source

The owner's request of 2026-10-28, after `make verify` on the iMac failed with status 141 in `test/installation-script.test.ts:348`, to fix `unpack_context` and `saved_manifest` in worktree `taskelith-worktrees/drain-tar-pipes-in-installation-script` on branch `drain-tar-pipes-in-installation-script`. The owner asked the session to do the work itself rather than in a subagent.

- **Base revision:** `7442b1bb` (`dev`, merge of pull request #400).
- **Scope:** `scripts/installation.sh` (`unpack_context`, `saved_manifest`); `test/installation-script.test.ts`; the `local-installation` spec delta.
- **Out of scope:** other pipes in repository scripts.

## Author self-check

- **Root cause.** Status 141 is 128 + SIGPIPE. Of the check's pipes, only `unpack_context` runs unguarded under `set -e`; a failure of `saved_manifest` is caught and reported as status 1. 15 runs of the reproducibility tests in isolation passed, so the race needs load.
- **Fail-before.** With `FAKE_TAR_TRAILER` and the base script, the new test failed in 3 of 3 runs with `141 !== 0`. With only `unpack_context` drained, it failed with status 1 and "the manifest.json of the saved image …-first cannot be read".
- **Pass-after.** `test/installation-script.test.ts` passed 34 of 34 tests in 3 of 3 runs.

## make verify

On the clean committed tree of `b350f8ce` (tree `b70e5885`), profile full: passed, stamp written. Tests: 3370, passed 3355, failed 0, skipped 15. Coverage of all files: lines 99.45%, branches 92.62%, functions 99.07%.

<!-- make record: begin -->
## Generated checks

Written by `make record`; `make record-check` checks it against the tree. Edit nothing between the markers.

- `make verify`: passed, profile full, tree `c25a668d88b5f72920c0c96d00e711c964364d55`; tests 3370, pass 3355, fail 0, skipped 15; all files 99.45% lines, 92.62% branches, 99.07% functions.
- `npm run openspec -- validate drain-tar-pipes-in-installation-script --strict`: passed, `Change 'drain-tar-pipes-in-installation-script' is valid`.
- `make findings ARGS="validate"`: passed, `Every findings file is valid: 77 file(s); every pass summary file is valid: 57 file(s); every route file is valid: 13 file(s).`.
- Spec diff against the merge base `7442b1bbd4f1` with `origin/dev`: no change under `openspec/specs`.
- Review passes in `passes.jsonl`: none yet.
<!-- make record: end -->

## Review sequence

The reviewers follow the owner's review sequence of 2026-10-28, relayed by coordinator Niki and not yet recorded in `docs/governance.md`: pass 1 Codex `gpt-6-astra#medium`, pass 2 Claude Code `claude-opus-5-5`, pass 3 Codex `gpt-6.1-sol#medium`, stopping at the first pass with only Low findings or none. The owner ordered pass 2 at effort medium, but `make review` authorizes `claude-opus-5-5` only at `high`, so pass 2 runs at `high` (Niki, 2026-10-28). `route.json` (standard, no trigger) recommends `gpt-6.1-sol` as reviewer A; its defaults predate the owner's sequence, so `gpt-6-astra` stays reviewer A of pass 1 (Niki, 2026-10-28).

## Remaining gates

- Review passes 1 and 2, then the archive.
