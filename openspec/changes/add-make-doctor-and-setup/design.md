## Context

The Makefile already derives the Node.js pin from `.nvmrc` and the npm pin from the release workflow. Repository scripts are TypeScript run with `node --experimental-strip-types`. nvm is a shell function, so a TypeScript script cannot switch its own Node.js version.

## Goals / Non-Goals

Goals: one command to check and one to fix the local prerequisites of `make verify`, with the pins defined once. Non-goals: installing system tools (git, nvm, Docker), changing the calling shell's Node.js, or checking tools that no target needs yet.

## Decisions

- **Pins come from the Makefile.** Both targets pass `NODE_PIN` and `NPM_PIN` to the scripts, so `.nvmrc` and the release workflow stay the only sources.
- **Pure checks, thin runners.** `scripts/environment-checks.ts` turns collected facts into results and setup steps and is unit-tested with a fake command runner; `doctor.ts` and `setup.ts` only run commands and print.
- **Dependencies are checked with `npm ls --all`.** It fails when `node_modules` is missing, when a locked package is missing, and when a workspace link is missing.
- **Node.js through a small bash wrapper.** `scripts/with-pinned-node.sh` sources nvm when it is installed, runs `nvm install` (reads `.nvmrc`; a no-op when present), and runs the setup script with that Node.js. Without nvm it uses the Node.js on `PATH`, and the Node.js check reports the mismatch. The calling shell still needs `nvm use`, which setup says when the versions differ.
- **Order of steps.** The npm pin is installed first and the dependencies are then installed with it; an npm change always reinstalls the dependencies.
- **doctor guards old Node.js.** A Node.js that cannot run the scripts (older than 22.6) gets a one-line message from the Makefile instead of a syntax error.

## Risks / Trade-offs

- `npm install --global npm@<pin>` changes the npm of the Node.js version that setup uses; this is the step the documentation already prescribes.
- `npm ls --all` takes about a second.
- The bash wrapper is not unit-tested; it was exercised by hand with and without the pinned Node.js in the calling shell.
