# Verification: add-make-doctor-and-setup

## Scope and source

The owner's request on 2026-10-24: "Добави команда маке доктор и команда маке сетуп, които съответно проверят и верифицират зависимостите проектът да стартира и добавят липсващите зависимости" (add `make doctor` and `make setup`, which respectively check and verify the dependencies the project needs to start, and add the missing ones). Base revision: `2890be6` on `dev`. Prepared in a git worktree. Scope: `Makefile`, `scripts/environment-checks.ts`, `scripts/doctor.ts`, `scripts/setup.ts`, `scripts/with-pinned-node.sh`, `test/environment-checks.test.ts`, `README.md`, `AGENTS.md`, `docs/releases.md`, and this change.

## Author self-check before review

- No new dependency: the scripts use Node.js built-ins; nvm is the tool the documentation already prescribes, used only when installed and never installed by setup.
- Pins stay single-sourced in the Makefile (`.nvmrc` and the release workflow).
- Checks are pure functions tested with a fake command runner; the runners and the bash wrapper only execute commands.

## Checks

Node v24.22.1, npm 12.2.1, macOS, in the worktree:

- Fresh worktree without `node_modules`: `make doctor` reported the dependency check failed with the remedy `make setup` and exited 2 (make's code for a failing recipe). `make setup` ran `npm ci --ignore-scripts`, reported all five checks passed, and exited 0. `make doctor` then passed.
- From a shell on Node v24.21.0 (npm 11.19.0): `make doctor` failed the Node.js and npm checks with remedies. `make setup` ran `nvm install` ("v24.22.1 is already installed"), passed every check under the pinned Node.js, and printed "Your shell uses Node.js v24.21.0; run 'nvm use' before make verify."
- `make verify` passed: 143 tests, 0 failed, coverage thresholds met, 27 strict OpenSpec validations, package verification.

Not exercised: installing a missing Node.js through nvm, installing a different npm (the pinned npm was already present), and a clone without the hook configuration (the worktree shares the main clone's `core.hooksPath`); the unit tests cover the order and commands of those steps.

## Independent review

Pending.
