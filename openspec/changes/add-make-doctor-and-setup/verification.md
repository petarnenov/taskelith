# Verification: add-make-doctor-and-setup

## Scope and source

The owner's request on 2026-10-24, paraphrased: add `make doctor`, which checks and verifies the dependencies the project needs to start, and `make setup`, which adds the missing ones. Base revision: `2890be6` on `dev`. Prepared in a git worktree. Scope: `Makefile`, `scripts/environment-checks.ts`, `scripts/doctor.ts`, `scripts/setup.ts`, `scripts/with-pinned-node.sh`, `test/environment-checks.test.ts`, `README.md`, `AGENTS.md`, `docs/releases.md`, and this change.

## Author self-check before review

- No new dependency: the scripts use Node.js built-ins; nvm is the tool the documentation already prescribes, used only when installed and never installed by setup.
- Pins stay single-sourced in the Makefile (`.nvmrc` and the release workflow).
- Checks are pure functions tested with a fake command runner; the runners and the bash wrapper only execute commands.

## Checks

Node v24.22.1, npm 12.2.1, macOS, in the worktree:

- Fresh worktree without `node_modules`: `make doctor` reported the dependency check failed with the remedy `make setup` and exited 2 (make's code for a failing recipe). `make setup` ran `npm ci --ignore-scripts`, reported all five checks passed, and exited 0. `make doctor` then passed.
- From a shell on Node v24.21.0 (npm 11.19.0): `make doctor` failed the Node.js and npm checks with remedies. `make setup` ran `nvm install` ("v24.22.1 is already installed"), passed every check under the pinned Node.js, and printed "Your shell uses Node.js v24.21.0; run 'nvm use' before make verify."
- `make verify` passed before review: 143 tests, 0 failed, coverage thresholds met, 27 strict OpenSpec validations, package verification.

Not exercised: installing a missing Node.js through nvm, installing a different npm (the pinned npm was already present), and a clone without the hook configuration (the worktree shares the main clone's `core.hooksPath`); the unit tests cover the order and commands of those steps.

After the pass-1 fixes, `make verify` passed with 144 tests and 27 strict validations, and `make doctor` passed in the worktree.

## Independent review

Assigned reviewer (rotation): Claude Code with model `claude-fable-5-1` (confirmed in the JSON `modelUsage`), effort medium, permission mode `plan`, with `Edit`, `Write`, and `NotebookEdit` disallowed. SHA-256 snapshots of `git ls-files -co --exclude-standard` before and after each pass were equal.

- **Pass 1 — session `f20af0b7-519d-4b27-9225-4165084665fc`, on `143c208`.** Findings: 0 Critical, 0 High, 2 Medium, 4 Low. All accepted and resolved:
  1. Medium: without git, setup still planned `enable-hooks`, failed on `git config`, and exited before printing the remedy. The hook step now requires a passing git check; the test uses a realistic state (no git, no hooks path).
  2. Medium: without nvm and with another Node.js, setup still installed npm and the dependencies into that Node.js. Setup now runs no step when the Node.js check fails; a test and a spec scenario cover it.
  3. Low: `doctor` and `setup` were missing from `.PHONY` (the line had gained the SpecKit targets on `dev`). Added.
  4. Low: the wrapper failed under `set -u` without `HOME`, and its header described it as a general runner. It now falls back to an empty `HOME` and is described as the setup wrapper.
  5. Low: the dependency label and requirement promised lockfile-exact versions, but `npm ls --all` checks against the `package.json` ranges. The label, requirement, proposal, and design now say "dependency tree complete (`npm ls --all`)".
  6. Low: task 3.1 was unchecked, and `AGENTS.md` said "once per clone" while each worktree needs setup. Checked, and `AGENTS.md` now says once per worktree.
