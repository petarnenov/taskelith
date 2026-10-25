# Verification: fix-pinned-node-notice

## Scope and source

Assigned by the coordinator (Niki) on 2026-10-25 to the worker Ziki, as the follow-up that the worker reported in `fix-pinned-node-path-order`. Base revision: `51fb660` on `dev`. Scope: the notice in `scripts/environment-checks.ts`, its callers `scripts/doctor.ts` and `scripts/setup.ts`, its test in `test/environment-checks.test.ts`, the README sentence on direct `npm` and `node` use, the `development-environment` spec delta, and this change. Prepared in the git worktree `../taskelith-worktrees/fix-pinned-node-notice` on branch `fix-pinned-node-notice`. The published package is unchanged, so the commit type is `build`.

## Environment

Ubuntu 24.04.5 LTS, Linux 6.8.0-147-generic, x86_64; nvm 0.40.3 with Node.js v24.22.1 and npm 12.2.1; Docker Engine 27.3.1, Compose v2.29.7. The host's own `PATH` puts `~/.local/bin`, with Node.js v24.22.0, before nvm's directory.

## Author self-check before review

- The notice still appears only when the shell's Node.js differs from the checks' Node.js; only its text and its new directory parameter changed.
- The other mentions of `nvm use` were checked: the worktree steps in `docs/agent-task-protocol.md` are setup instructions, not quotes of the notice, and stay unchanged; `docs/linux-verify-observation.md` is a dated record and stays unchanged.
- The new comment is at most two lines of at most 80 characters; `make verify` checks this.
- Evidence check: the change adds no external link or external evidence.

## Checks

- `node --experimental-strip-types --test test/environment-checks.test.ts` passed (16 passed, 0 failed).
- `npm run openspec -- validate fix-pinned-node-notice --strict` passed.
- `make doctor` under the host's own `PATH` passed all 7 checks and printed: "These checks ran under Node.js v24.22.1, which make doctor and make verify select on their own; your shell uses v24.22.0. To run npm or node directly, run 'nvm use' and check that 'node -v' prints v24.22.1; if it does not, another Node.js comes first in PATH, so run: export PATH="/home/petar/.nvm/versions/node/v24.22.1/bin:$PATH"". After the printed line was evaluated in a shell, `command -v node` named the nvm v24.22.1 binary and `node -v` printed v24.22.1.
- `make verify` at `90cd1d6` under the host's own `PATH` passed (929 tests, 914 passed, 0 failed, 15 skipped on macOS-only tests; coverage 98.94% lines, 91.75% branches, 98.52% functions; strict OpenSpec validation 53 passed, 0 failed). It passed again at `8ec5802`, before pass 1 (914 passed, 0 failed).
- After the pass-1 fixes: the notice test passed (17 passed, 0 failed), and `make doctor` under the host's own `PATH` printed the line as `export PATH='/home/petar/.nvm/versions/node/v24.22.1/bin':"$PATH"`.

## Independent review

Reviewer: Codex (`gpt-6.1-sol`), reasoning effort medium, read-only sandbox, as assigned by the coordinator, run from the worktree as `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, with the prompt and log outside the worktree.

- **Pass 1 — session `01a173e9-4060-7c70-9704-0b5706e7e60d`, head `8ec5802`.** The header confirmed the model, reasoning effort medium, and the read-only sandbox; the snapshot (`git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256`) was `72bdd077…9b37` before and after the pass. The reviewer found the naming, the callers, the full `MODIFIED` copies, the README, the scope, and the `build` type sound. Findings: 0 Critical, 0 High, 1 Medium, 2 Low. All accepted and resolved (unreviewed until pass 2):
  1. Medium: the printed line put the directory in double quotes, so `$`, backticks, backslashes, and `"` in it were interpreted, and a crafted directory could run a command. The directory is now single-quoted with `'` escaped, and a new test runs the line with `sh` for directories with a space, `$USER`, a command substitution, backticks, double quotes, and a single quote, and asserts the literal `PATH` and no stderr.
  2. Low: the notice said that a failed `node -v` check means another Node.js comes first, which is not the only cause. The fallback now names no cause, and the test asserts the full notice for a shell without Node.js.
  3. Low: the evidence check was not recorded. It is now recorded.

## Limitations

- Observed on one Linux host. The printed line uses POSIX shell syntax; other shells need their own form.
- The notice stays silent when the shell's Node.js reports the pinned version from another installation, as before; the make targets select the pin in that case since `fix-pinned-node-path-order`.

## Remaining gates

- Coordinator integration into `dev` and archive.
