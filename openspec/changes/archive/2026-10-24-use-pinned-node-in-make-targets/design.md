## Context

`scripts/with-pinned-node.sh` loads nvm, runs `nvm install` for the version in `.nvmrc`, and executes `scripts/setup.ts` under it. `make doctor` and `make verify` run under whatever Node.js the shell has on `PATH`. The `pre-push` hook runs `make verify`. A process cannot change its parent's environment, so no target can switch the calling shell.

## Goals / Non-Goals

Goals: `make setup` followed by `make doctor`, `make verify`, or a push works in the same shell; new shells start on the pinned version. Non-goals: switching the calling shell, installing nvm, or changing which facts the checks pass or fail.

## Decisions

- **One wrapper with two modes.** `with-pinned-node.sh <install|use> <command...>` selects the Node.js and then executes any command. `install` (setup) runs `nvm install <pin>` only when `nvm use <pin>` fails, because `nvm install` looks the version up online even when it is installed, and then `nvm alias default <pin>`. `use` (doctor, verify) runs `nvm use <pin>` only when the shell's Node.js differs from the pin, and ignores its failure, so that a missing pinned version falls through to the checks that report it; `make doctor` never installs anything.
- **Skip nvm when the shell already matches.** In `use` mode a shell on the pinned version, including the GitHub job set up from `.nvmrc`, does not load nvm at all, so CI behavior is unchanged.
- **`make verify` re-enters make.** `verify` runs the wrapper with `$(MAKE) verify-checks`, which holds the previous recipe and its `toolchain` prerequisite, so that every check, including the npm commands, runs with the selected Node.js and its npm.
- **One script guard after selection.** The Node.js 22.6 guard of the `doctor` recipe and the old wrapper's guard become `scripts/run-node-script.sh`, which `make doctor` and `make setup` run under the wrapper. `make verify` does not need it, so that its `toolchain` check always reports a mismatch, also for an old or missing Node.js. Every Node.js remedy reads the same: `make setup` with nvm, a manual install without it. `nvm use` is no longer a remedy, because the wrapper has already tried it; the npm remedy of `toolchain` names `make setup` instead of a global npm install that would go to the shell's Node.js.
- **The notice explains direct commands.** `shellNodeNotice` is shown by setup and doctor when the checks ran under another version than the shell, and says that `nvm use` is needed only for running `npm` or `node` directly.
- **nvm default alias.** Setting `default` is user-wide nvm state; the owner approved it on 2026-10-24 as part of this change, so that new shells match the repository pin.

## Risks / Trade-offs

- Direct `npm` or `node` commands in an old shell still use the shell's Node.js; the notice and README say so.
- Changing nvm's `default` affects other projects that rely on it.
