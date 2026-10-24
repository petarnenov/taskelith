## Why

The owner reported on 2026-10-24 that `make doctor` fails right after a successful `make setup`. Setup runs under the `.nvmrc` Node.js through `scripts/with-pinned-node.sh`, but a child process cannot switch the calling shell's Node.js, so a shell on another version fails the Node.js and npm checks until the contributor runs `nvm use`. `make verify` and the `pre-push` hook fail the same way.

## What Changes

- `make doctor`, `make verify`, and therefore the `pre-push` hook run with the `.nvmrc` Node.js through nvm when nvm has it installed, so that they pass after `make setup` without `nvm use`. Without nvm, or with the pinned version missing, they keep the shell's Node.js and report the mismatch.
- `make setup` also makes the pinned version nvm's `default` alias, so that new shells start with it.
- `make setup` and `make doctor` tell a shell on another Node.js that the make targets select the pinned version themselves and that `nvm use` is needed only for running `npm` or `node` directly.
- The Node.js remedies of `make doctor` and `make verify` name `make setup` through nvm, or a manual install, instead of `nvm use`.

## Capabilities

### New Capabilities

### Modified Capabilities
- `development-environment`: which Node.js `make doctor` and `make setup` run under, their Node.js remedies and notice, and the nvm default alias.
- `integration-flow`: `make verify` runs with the pinned Node.js when nvm has it, and its mismatch remedy.

## Impact

`Makefile`, `scripts/with-pinned-node.sh`, `scripts/environment-checks.ts`, `scripts/doctor.ts`, `scripts/setup.ts`, `test/environment-checks.test.ts`, `README.md`, and `docs/releases.md`. No new dependency. `make setup` changes nvm's `default` alias, which is user-wide nvm state.
