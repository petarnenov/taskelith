# Verification: fix-pinned-node-notice

## Scope and source

Assigned by the coordinator (Niki) on 2026-10-25 to the worker Ziki, as the follow-up that the worker reported in `fix-pinned-node-path-order`. Base revision: `51fb660` on `dev`. Scope: the notice in `scripts/environment-checks.ts`, its callers `scripts/doctor.ts` and `scripts/setup.ts`, its test in `test/environment-checks.test.ts`, the README sentence on direct `npm` and `node` use, the `development-environment` spec delta, and this change. Prepared in the git worktree `../taskelith-worktrees/fix-pinned-node-notice` on branch `fix-pinned-node-notice`. The published package is unchanged, so the commit type is `build`.

## Environment

Ubuntu 24.04.5 LTS, Linux 6.8.0-147-generic, x86_64; nvm 0.40.3 with Node.js v24.22.1 and npm 12.2.1; Docker Engine 27.3.1, Compose v2.29.7. The host's own `PATH` puts `~/.local/bin`, with Node.js v24.22.0, before nvm's directory.

## Author self-check before review

- The notice still appears only when the shell's Node.js differs from the checks' Node.js; only its text and its new directory parameter changed.
- The other mentions of `nvm use` were checked: the worktree steps in `docs/agent-task-protocol.md` are setup instructions, not quotes of the notice, and stay unchanged; `docs/linux-verify-observation.md` is a dated record and stays unchanged.
- The new comment is at most two lines of at most 80 characters; `make verify` checks this.

## Checks

- `node --experimental-strip-types --test test/environment-checks.test.ts` passed (16 passed, 0 failed).
- `npm run openspec -- validate fix-pinned-node-notice --strict` passed.
- `make doctor` under the host's own `PATH` passed all 7 checks and printed: "These checks ran under Node.js v24.22.1, which make doctor and make verify select on their own; your shell uses v24.22.0. To run npm or node directly, run 'nvm use' and check that 'node -v' prints v24.22.1; if it does not, another Node.js comes first in PATH, so run: export PATH="/home/petar/.nvm/versions/node/v24.22.1/bin:$PATH"". After the printed line was evaluated in a shell, `command -v node` named the nvm v24.22.1 binary and `node -v` printed v24.22.1.
- `make verify` at `90cd1d6` under the host's own `PATH` passed (929 tests, 914 passed, 0 failed, 15 skipped on macOS-only tests; coverage 98.94% lines, 91.75% branches, 98.52% functions; strict OpenSpec validation 53 passed, 0 failed).

## Independent review

Reviewer: Codex (`gpt-6.1-sol`), reasoning effort medium, read-only sandbox, as assigned by the coordinator, run from the worktree as `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, with the prompt and log outside the worktree.

## Limitations

- Observed on one Linux host. The printed line uses POSIX shell syntax; other shells need their own form.
- The notice stays silent when the shell's Node.js reports the pinned version from another installation, as before; the make targets select the pin in that case since `fix-pinned-node-path-order`.

## Remaining gates

- Coordinator integration into `dev` and archive.
