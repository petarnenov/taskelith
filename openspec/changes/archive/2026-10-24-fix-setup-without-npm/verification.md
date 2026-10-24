# Verification: fix-setup-without-npm

## Scope and source

Follow-up to Low finding 4 of the first review pass of `fix-doctor-node-remedy`: with the pinned Node.js active but no npm on `PATH`, `make doctor` advised `make setup`, and setup's `install-npm` step then failed because it needs npm. Assigned by the coordinator on 2026-10-24. Base revision: `546407f` on `dev`. Prepared in a git worktree. Scope: `scripts/environment-checks.ts`, `scripts/setup.ts`, `test/environment-checks.test.ts`, and this change. `scripts/with-pinned-node.sh` and the `Makefile` were reviewed and left unchanged (see `design.md`).

## Author self-check before review

- Behavior of the checks is unchanged: the same facts pass and fail; only the npm and dependency remedies for a pinned Node.js without npm, and setup's steps in that case, change.
- Setup runs no npm command without npm, and still enables the hook.
- Evidence check: the remedy relies on two nvm behaviors, confirmed in the local `~/.nvm/nvm.sh`: `nvm uninstall` refuses the active version ("Cannot uninstall currently-active node version"), and `nvm install` of an installed version only reports "is already installed".

## Checks

Node v24.22.1 installed through nvm, npm 12.2.1, macOS, in the worktree:

- With only a `node` symlink to v24.22.1, `/usr/bin`, and `/bin` on `PATH`, `NVM_DIR` pointing to a missing directory, and `core.hooksPath` unset. `$S` is a scratch directory outside the worktree; the commands ran from the worktree:

  ```bash
  mkdir -p "$S/nonpm" && ln -sf ~/.nvm/versions/node/v24.22.1/bin/node "$S/nonpm/node"
  git config --unset core.hooksPath
  env -i HOME="$HOME" NVM_DIR="$S/none" PATH="$S/nonpm:/usr/bin:/bin" make doctor
  env -i HOME="$HOME" NVM_DIR="$S/none" PATH="$S/nonpm:/usr/bin:/bin" make setup
  git config --get core.hooksPath   # .githooks, restored by make setup
  ```

  - `make doctor` failed the npm check with "Reinstall Node.js 24.22.1, which includes npm: with nvm, run nvm deactivate, nvm uninstall 24.22.1, and make setup; without nvm, reinstall Node.js 24.22.1 yourself.", the dependency check with "Fix the npm check first; dependencies are installed with npm.", and the hook check with "Run make setup.", and exited 2.
  - `make setup` ran only `git config core.hooksPath .githooks`, then reported the npm and dependency checks with the same remedies and the hook check as passed, and exited 2.
- Not exercised: the nvm reinstall sequence itself (it would remove the working pinned Node.js); its two nvm behaviors were checked in `nvm.sh` as above.
- `make verify` passed before review: 199 tests, 0 failed, coverage thresholds met, 31 strict OpenSpec validations, package verification.
- `make verify` passed after the pass-1 fixes with the same results.

## Independent review

Assigned reviewer: Codex CLI, invoked as `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>` from the task worktree; prompt, log, and snapshot files kept in a scratch directory outside the worktree.

- **Pass 1 — session `01a16f8e-bb35-7292-8c73-c62dc04f8e24`, on `4fee311`.** The output header reported model `gpt-6.1-sol`, reasoning effort `medium`, and sandbox `read-only`. SHA-256 snapshots before and after were equal. The reviewer reported no functional defect; it compared 72 fact combinations against the base and found pass/fail unchanged and setup steps changed only in the target case. Findings: 0 Critical, 0 High, 0 Medium, 3 Low. Low-only pass, so all three were fixed without another review (unreviewed fixes):
  1. Low: the delta's "Dependencies missing" scenario still required the remedy `make setup` unconditionally, and "npm pin changes" did not exclude a missing npm, contradicting the new scenarios. Both scenarios now state their conditions: npm on `PATH` or the pinned Node.js not active, and npm on `PATH` with another version.
  2. Low: `tasks.md` marked the review task done before any result was recorded. This record now holds the pass, and the task stays checked on that basis.
  3. Low: the reproduction did not record the exact commands. They are now listed above, including how the hook configuration was restored.

## Remaining gates

Integration into `dev`, and archiving.
