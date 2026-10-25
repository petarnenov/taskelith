# Verification: fix-pinned-node-path-order

## Scope and source

Assigned by the coordinator (Niki) on 2026-10-25 to the worker Ziki as the fix of finding F1 of `docs/linux-verify-observation.md`. Base revision: `78bd9ef` on `dev`. Scope: `scripts/with-pinned-node.sh`, the new `test/with-pinned-node.test.ts`, the `development-environment` spec delta, and this change. Prepared in the git worktree `../taskelith-worktrees/fix-pinned-node-path-order` on branch `fix-pinned-node-path-order`. The published package is unchanged, so the commit type is `build`.

## Environment

Ubuntu 24.04.5 LTS, Linux 6.8.0-147-generic, x86_64; nvm 0.40.3 with Node.js v24.22.1 and npm 12.2.1; Docker Engine 27.3.1, Compose v2.29.7. The host's own `PATH` puts `~/.local/bin`, with Node.js v24.22.0 and npm 11.19.1, before nvm's directory. Unlike the observation, these runs use that `PATH` without a workaround.

## Author self-check before review

- The cause was confirmed in nvm 0.40.3's `nvm_change_path`: it replaces an existing nvm entry in place and prepends only without one or after `/bin`, `/usr/bin`, or `/usr/local/bin`.
- The wrapper prepends only after a successful `nvm use` or `nvm install`, and only when `nvm which` succeeds, so the missing-pin path is unchanged; the new test covers both.
- The new comments are at most two lines of at most 80 characters; `make verify` checks this.
- Evidence check: the proposal's relative link to `docs/linux-verify-observation.md` resolves.

## Checks

- `node --experimental-strip-types --test test/with-pinned-node.test.ts` with the wrapper of `78bd9ef`: the use-mode and install-mode cases failed and the missing-pin case passed (1 passed, 2 failed). With the fix: 3 passed, 0 failed.
- After the pass-1 fixes, the revised test against the wrapper of `78bd9ef`: 1 passed, 3 failed; against the fixed wrapper: 4 passed, 0 failed.
- `npm run openspec -- validate fix-pinned-node-path-order --strict` passed.
- At `b008651`, under the host's own `PATH`, where `node -v` printed v24.22.0: `make setup` passed with all 7 checks (5.0 s); `make doctor` passed all 7 checks (3.0 s); `make verify` passed (917 tests, 902 passed, 0 failed, 15 skipped on macOS-only tests; coverage 98.93% lines, 91.72% branches, 98.51% functions; strict OpenSpec validation 53 passed, 0 failed; package verification passed; 2 min 57 s). `make verify` passed again at `cc77411`, before pass 1 (902 passed, 0 failed).
- At `04b4832`, after the pass-1 fixes and before pass 2, under the host's own `PATH`: `make doctor` passed all 7 checks; `make verify` passed (918 tests, 903 passed, 0 failed, 15 skipped; coverage 98.93% lines, 91.70% branches, 98.51% functions).
- After the pass-2 fix, which changed only this record and `tasks.md`, `make verify` ran in the `pre-push` hook of the handoff push.

## Independent review

Reviewer: Codex (`gpt-6.1-sol`), reasoning effort medium, read-only sandbox, as assigned by the coordinator, run from the worktree as `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, with the prompt and log outside the worktree.

- **Pass 1 — session `01a173ba-d3e9-7433-a9c3-7c02fdd2d5b4`, head `cc77411`.** The header confirmed the model, reasoning effort medium, and the read-only sandbox; the snapshot (`git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256`) was `e9d3e02f…129a` before and after the pass. The reviewer found the quoting, the `set -eu` handling, the nvm description, the full `MODIFIED` copy, the comment lengths, the scope, and the `build` type sound. Findings: 0 Critical, 0 High, 1 Medium, 1 Low. Both accepted and resolved (unreviewed until pass 2):
  1. Medium: the use mode skipped nvm when the shell's Node.js reported the pinned version, so another installation of that version, with its own npm, stayed first. The use mode now selects the pin whenever nvm is installed, and a test with a same-version shadow asserts the selected path.
  2. Low: the install test never reached `nvm install`, because the fake's `use` succeeded. The fake now marks the pin as installed only after `nvm install`, and the install test starts without the pin and asserts the install and the selected path.

- **Pass 2 — session `01a173bf-ce0b-7400-b26f-30e94b7d148e`, head `04b4832`.** The header confirmed the model, reasoning effort medium, and the read-only sandbox; the snapshot was `43787522…b1c` before and after the pass. The reviewer confirmed both pass-1 resolutions and reviewed the whole change again, finding no correctness or scope problem. Findings: 0 Critical, 0 High, 0 Medium, 1 Low, resolved without another review, as the review process permits for a Low-only pass; this fix is **unreviewed**:
  1. Low: no `make verify` was recorded after the pass-1 fixes. The run at `04b4832` is now recorded under "Checks".

## Limitations

- Observed on one Linux host. macOS runs only the new test through `make verify` there; the wrapper's macOS behavior is the same shell code.
- The notice of `make setup` and `make doctor` still advises `nvm use` for running `npm` or `node` directly; in a shell like this host's, `nvm use` does not put the pinned version first either. This is outside the assigned scope and reported to the coordinator.

## Remaining gates

- Coordinator integration into `dev` and archive.
