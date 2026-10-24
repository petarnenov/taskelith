# Verification: use-pinned-node-in-make-targets

## Scope and source

Requested by the owner on 2026-10-24 after `make doctor` failed right after a successful `make setup` in a shell on Node.js v24.21.0 (pin: v24.22.1). The owner approved the approach, including nvm's `default` alias. Base revision: `bbe0809` on `dev`. Prepared in a git worktree by the UI proof-of-concept worker, outside the coordinator's queue, because the owner asked that session directly. Scope: `Makefile`, `scripts/with-pinned-node.sh`, the new `scripts/run-node-script.sh`, `scripts/environment-checks.ts`, `scripts/doctor.ts`, `scripts/setup.ts`, `test/environment-checks.test.ts`, `README.md`, `docs/releases.md`, and this change.

## Author self-check

- Checks pass and fail on the same facts; only the Node.js that `make doctor` and `make verify` run under, the Node.js remedies, and the shell notice change.
- The GitHub `verify` job sets up the `.nvmrc` version with `actions/setup-node`, so the wrapper's `use` mode does not load nvm there.
- `make doctor` installs nothing: `use` mode runs only `nvm use`.
- Recorded before the first pass, but written only after it (see pass 1, finding 1): the reproductions below and the evidence check.
- Evidence check: the change relies on nvm v0.40.1 (the local `~/.nvm`, `git describe --tags`) behaviors: `nvm use <version>` fails without side effects when the version is not installed, `nvm alias default <version>` writes `$NVM_DIR/alias/default`, and `nvm install` resolves the version online (`nvm_remote_version`, `nvm.sh` line 3420) before it checks whether it is installed (line 3498). The design and README link no external page.

## Checks

macOS, Node.js v24.22.1 and v24.21.0 (and v20.1.0 for an old Node.js) installed through nvm v0.40.1, npm 12.2.1 under the pin.

- Reproductions from the worktree with the script below, each command under `env -i HOME="$HOME" NVM_DIR=<dir> PATH=<path>`. `$S` is a scratch directory outside the worktree; `$S/nvm-nopin` holds a copy of `nvm.sh` with only v24.21.0, `$S/nvm-setup` a copy with v24.21.0 and v24.22.1 and no alias, `$S/none` does not exist.

  | Case | Command | Result |
  | --- | --- | --- |
  | shell v24.21.0, nvm with the pin | `make doctor` | all checks passed under v24.22.1, notice names `nvm use` for direct commands, exit 0 |
  | shell v24.21.0, nvm without the pin | `make doctor` | Node.js check failed with "With nvm, run make setup to install Node.js 24.22.1; without nvm, install Node.js 24.22.1 yourself.", npm remedy "Fix the Node.js check first", exit 2 |
  | no nvm, shell v20.1.0 | `make doctor` | "Node.js v20.1.0 cannot run the repository scripts." with the same remedy, exit 2 |
  | no nvm, no Node.js | `make doctor` | "Node.js not found." with the same remedy, exit 2 |
  | no nvm, shell v20.1.0 | `make verify` | toolchain check failed: "Node v20.1.0 does not match .nvmrc (v24.22.1)." with the same remedy, exit 2 |
  | no nvm, no Node.js | `make verify` | toolchain check failed with "Node none", exit 2 |
  | shell v24.21.0, `$S/nvm-setup` | `make setup` | no `nvm install` (pin installed), `default -> 24.22.1`, all checks passed, notice shown, exit 0; `alias/default` holds `24.22.1` |
  | shell v24.21.0, nvm with the pin | `make verify` | passed under v24.22.1: 215 tests, 0 failed, coverage thresholds met, 32 strict OpenSpec validations, package verification |

- `bash scripts/with-pinned-node.sh use` and `... bogus true` print the usage line and exit 2.
- Not exercised: `make setup` with nvm but without the pinned version, which downloads Node.js; the `nvm install` branch is unchanged apart from running only when `nvm use` fails.
- `make verify` passed before the first pass (215 tests, 0 failed) and after the pass-1 fixes with the same results.

## Independent review

Assigned reviewer: Antigravity CLI, chosen by the worker by rotation (the latest tasks went to Codex CLI and Claude Code), because the coordinator was busy; invoked as `agy -p "<prompt>" --model gemini-4-argon-medium --effort medium --mode plan --output-format json --log-file <log>` from the task worktree, with prompt, log, and snapshot files in a scratch directory outside the worktree.

- **Pass 1 — conversation `4dd05772-250e-44ac-99b1-5069e648d4e4`, on `4fe1494`.** The log reported model `gemini-4-argon-medium`. SHA-256 snapshots before and after were equal. Findings: 0 Critical, 1 High, 2 Medium, 4 Low, all fixed, for the next pass to check:
  1. High: `verification.md` was missing and task 2.1 open before the first pass. This record now holds the self-check, the evidence check, and the checks.
  2. Medium: the Node.js 22.6 guard in the wrapper stopped `make verify` before its `toolchain` check for an old or missing Node.js. The guard moved to `scripts/run-node-script.sh`, used only by `make doctor` and `make setup`, and `toolchain` reports a missing Node.js as `none`.
  3. Medium: `nvm install` resolves the version online even when it is installed, so `make setup` failed offline. `install` mode now runs `nvm install <pin>` only when `nvm use <pin>` fails, and both modes pass the pin explicitly.
  4. Low: the Node.js remedies told contributors who already had nvm to install it. All Node.js remedies now read "With nvm, run make setup to install Node.js <pin>; without nvm, install Node.js <pin> yourself."
  5. Low: the wrapper did not handle missing arguments under `set -u`. It now prints its usage and exits 2 with fewer than two arguments, as for an unknown mode.
  6. Low: the `integration-flow` requirement and `docs/releases.md` omitted the contract compatibility check from `make verify`. Both now name it.
  7. Low: the `toolchain` npm remedy named a global npm install, which would go to the shell's Node.js. It now names `make setup`.

## Remaining gates

Review pass 2, handoff to the coordinator, integration into `dev`, and archiving.
