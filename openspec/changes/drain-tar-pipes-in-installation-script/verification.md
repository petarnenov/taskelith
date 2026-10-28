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

## Remaining gates

- `make verify` on the clean committed tree.
- Review passes 1 and 2, then the archive.
