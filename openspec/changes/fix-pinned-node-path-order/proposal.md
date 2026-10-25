## Why

Finding F1 of the [Linux verify observation](../../../docs/linux-verify-observation.md): on a host with a Node.js outside nvm earlier in `PATH`, for example in `~/.local/bin`, `scripts/with-pinned-node.sh` does not take effect. `nvm use` updates nvm's own `PATH` entry where it stands instead of putting it first, so the earlier Node.js still wins. `make setup` installs the pin and then fails its own checks, and `make doctor`, `make verify`, and the `pre-push` hook fail, contrary to the `development-environment` scenario "Shell on another Node.js after setup". The coordinator (Niki) assigned the fix on 2026-10-25.

## What Changes

- After a successful `nvm use` or `nvm install`, `scripts/with-pinned-node.sh` puts the directory of the pinned Node.js, from `nvm which`, first in `PATH` for the command it runs.
- Without the pinned version, the wrapper still leaves `PATH` alone, so the checks keep reporting the mismatch with their current remedies.
- A new test, `test/with-pinned-node.test.ts`, runs the wrapper with a fake nvm and a fake Node.js earlier in `PATH`.

## Capabilities

### New Capabilities

### Modified Capabilities
- `development-environment`: the requirement "Environment check" gains the scenario "Another Node.js earlier in PATH"; its text is unchanged.

## Impact

`scripts/with-pinned-node.sh`, `test/with-pinned-node.test.ts`, and the spec. The published package is not affected, so the commit type is `build`. No new dependency.
