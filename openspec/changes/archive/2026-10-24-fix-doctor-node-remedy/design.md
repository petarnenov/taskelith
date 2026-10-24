## Context

`make setup` runs through `scripts/with-pinned-node.sh`, which sources nvm and uses the `.nvmrc` Node.js for its own run. nvm is a shell function, so neither setup nor doctor can switch the calling shell's Node.js; `make doctor` checks the Node.js and npm on the calling shell's `PATH`. The remedies assumed that setup fixes a Node.js mismatch, which is true only when the pinned Node.js is not installed yet.

## Goals / Non-Goals

Goals: remedies that lead out of the mismatch in one step. Non-goals: changing what the checks pass or fail, detecting whether nvm or the pinned Node.js is installed, or making `make verify` switch Node.js itself.

## Decisions

- **`nvm use` first.** The Node.js remedy, and doctor's message for a Node.js too old to run the scripts, name `nvm use`, then `make setup` for a pinned Node.js that is not installed yet, then a manual install without nvm. Doctor does not detect nvm, so the text covers each case instead of choosing one.
- **npm follows Node.js.** Each Node.js has its own npm, so while the Node.js check fails, the npm remedy says to fix Node.js first; under the pinned Node.js it still names `make setup`.
- **Setup's notice is a pure function.** `shellNodeNotice` in `scripts/environment-checks.ts` builds the closing message, so it is unit-tested like the checks; `setup.ts` only prints it.

## Risks / Trade-offs

- The remedies are longer, because they cover the nvm and no-nvm cases in one line.
