## Why

On 2026-10-24 the owner ran `make doctor` from a shell on Node.js v24.21.0 with v24.22.1 installed through nvm. Doctor failed the Node.js and npm checks and advised `make setup`; setup passed every check under the pinned Node.js; doctor then failed again with the same advice. `make` cannot change the calling shell's Node.js, so the step the owner needed was `nvm use`, but the remedies sent them back to setup.

## What Changes

- The Node.js check's remedy names `nvm use` first and `make setup` only for a pinned Node.js that is not installed yet.
- While the Node.js check fails, the npm check's remedy says to fix Node.js first, because each Node.js has its own npm; with the pinned Node.js active it still names `make setup`.
- When the calling shell uses another Node.js, setup says its checks ran under the pinned Node.js and that the shell needs `nvm use` before `make doctor` or `make verify`.

## Capabilities

### New Capabilities

### Modified Capabilities
- `development-environment`: the remedies for a pinned Node.js that is installed but not active.

## Impact

`scripts/environment-checks.ts`, `scripts/setup.ts`, and `test/environment-checks.test.ts`. No new dependency and no change to what the checks pass or fail.
