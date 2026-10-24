## Context

`make doctor` and `make setup` share the checks in `scripts/environment-checks.ts`. Setup runs under the pinned Node.js through `scripts/with-pinned-node.sh`, and its steps `install-npm` and `install-dependencies` both run `npm`. A Node.js release ships with its own npm in the same `bin` directory, so a pinned Node.js without npm on `PATH` is a broken or partial install, not something setup can repair from the clone.

## Goals / Non-Goals

Goals: name the real fix for a pinned Node.js without npm, and keep setup from running steps that need npm. Non-goals: changing what the checks pass or fail, installing npm without npm (for example through Corepack), or detecting nvm.

## Decisions

- **Reinstall the pinned Node.js.** The npm remedy covers both cases in one line, as the Node.js remedy does: with nvm, `nvm deactivate`, `nvm uninstall <pin>`, and `make setup`, whose wrapper then runs `nvm install`; without nvm, a manual reinstall. `nvm deactivate` comes first because nvm refuses to uninstall the active version.
- **Dependencies follow npm.** While npm is missing under the pinned Node.js, the dependency remedy says to fix the npm check first instead of naming `make setup`. Under another Node.js both remedies keep their current text, because setup runs under the pinned Node.js and uses its npm.
- **Setup decides from the facts.** `setupSteps` takes the environment facts and the pins instead of the check results, because "npm missing" and "npm on another version" fail the same check but need different steps. It still derives the failing checks through `checkEnvironment`.
- **No wrapper or `Makefile` change.** With nvm, the wrapper's `nvm install` leaves an installed pinned version as it is, so the reinstall goes through `nvm uninstall`; the `Makefile` doctor guard only checks that Node.js can run the scripts.

## Risks / Trade-offs

- The npm remedy is long, because it covers the nvm and no-nvm cases.
