## Context

`scripts/with-pinned-node.sh` sources nvm and runs `nvm use` for `make doctor`, `make verify`, and `make dependency-inventory`, and `nvm install` and `nvm use` for `make setup`. In nvm 0.40.3, `nvm_change_path` replaces the entry of an nvm version in `PATH` where it stands. It prepends only when `PATH` has no such entry, or when `/bin`, `/usr/bin`, or `/usr/local/bin` comes before it. A Node.js in any other directory before that entry, such as `~/.local/bin`, therefore stays first.

## Goals / Non-Goals

Run the wrapped command with the pinned Node.js whenever nvm has it, whatever else is in `PATH`. Do not change the checks, their remedies, or the behavior without the pinned version.

## Decisions

- The wrapper keeps `nvm use`, which also sets nvm's own variables, and then prepends the directory that `nvm which "$NODE_PIN"` names. This relies on documented nvm commands rather than on nvm's internal path functions.
- The use mode no longer skips nvm when the shell's Node.js reports the pinned version: that Node.js may be another installation, with another npm, so only the directory nvm names counts as the pin. The cost is sourcing nvm on every run where nvm exists.
- The prepend runs only after `nvm use` or `nvm install` succeeded, and `put_pinned_node_first` returns without a change when `nvm which` fails, so a missing pin leaves the shell's Node.js and the existing failures and remedies in place.
- The test uses a fake `nvm.sh` that leaves `PATH` order unchanged, as real nvm does in this case, and fake `node` programs that print their version; the wrapped command prints the `node` it finds, so a same-version shadow is told apart by its path. A marker file makes `nvm install` real for the fake, so the install case runs through the install branch. The test runs on Linux and macOS without nvm or network access. Without the fix, the three pinned cases fail.

## Risks / Trade-offs

The pinned directory may appear twice in `PATH`, which is harmless. The prepend lasts only for the wrapped command; the calling shell is unchanged, as before.
