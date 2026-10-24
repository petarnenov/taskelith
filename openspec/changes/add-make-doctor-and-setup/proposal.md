## Why

The owner asked on 2026-10-24 for a `make doctor` command that checks whether the dependencies needed to start the project are present, and a `make setup` command that adds the missing ones. Today a contributor follows four manual steps (`nvm use`, the npm pin, `npm ci --ignore-scripts`, `make hooks`), and `make verify` only reports a wrong Node.js or npm version. A clone created before the npm workspaces existed, for example, still lacks the workspace links and fails only later in the build.

## What Changes

- `make doctor`: checks git, the Node.js version in `.nvmrc`, the CI npm pin, dependencies installed from `package-lock.json` (`npm ls --all`), and the pre-push hook; prints each result with a remedy; exits non-zero when any check fails; changes nothing.
- `make setup`: installs the `.nvmrc` Node.js through nvm when nvm is installed and runs the rest with it; installs the npm pin, the locked dependencies (`npm ci --ignore-scripts`), and the hook configuration when they are missing; then reports the same checks. It does not install git or nvm.
- The README, `AGENTS.md`, and the worktree steps in `docs/releases.md` use `make setup` and `make doctor`.

## Capabilities

### New Capabilities
- `development-environment`: checking and preparing a clone through `make doctor` and `make setup`.

### Modified Capabilities

## Impact

Repository scripts and documentation only: `Makefile`, `scripts/environment-checks.ts`, `scripts/doctor.ts`, `scripts/setup.ts`, `scripts/with-pinned-node.sh`, and a test. No product code and no new dependency; nvm is the tool the documentation already uses, and setup uses it only when it is installed.
