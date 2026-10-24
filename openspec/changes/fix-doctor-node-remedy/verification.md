# Verification: fix-doctor-node-remedy

## Scope and source

The owner reported on 2026-10-24, paraphrased: from a shell on Node.js v24.21.0, `make doctor` failed the Node.js and npm checks and advised `make setup`; `make setup` reported every check passed; `make doctor` then failed again the same way. Base revision: `4a3e69e` on `dev`. Prepared in a git worktree. Scope: `scripts/environment-checks.ts`, `scripts/setup.ts`, `test/environment-checks.test.ts`, and this change.

## Author self-check before review

- Behavior of the checks is unchanged: the same facts pass and fail; only the remedies and the setup closing message change.
- The npm remedy depends on the Node.js check because each Node.js has its own npm; under the pinned Node.js it still names `make setup`.

## Checks

Node v24.22.1 installed through nvm, macOS, in the worktree:

- From a shell on Node v24.21.0 (npm 11.19.0): `make setup` passed every check under v24.22.1 and printed "These checks ran under Node.js v24.22.1, but your shell uses v24.21.0; run 'nvm use' before make doctor or make verify." `make doctor` then failed the Node.js check with the remedy starting "Run nvm use" and the npm check with "Fix the Node.js check first; npm is checked under Node.js 24.22.1.", and exited 2.
- After `nvm use`: `make doctor` passed all five checks.
- `make verify` passed: 196 tests, 0 failed, coverage thresholds met, 30 strict OpenSpec validations, package verification.

## Independent review

Pending.

## Remaining gates

Independent review, integration into `dev`, and archiving.
