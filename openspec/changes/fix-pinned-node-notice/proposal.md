## Why

After `fix-pinned-node-path-order`, `make setup` and `make doctor` run under the pinned Node.js even when another Node.js comes earlier in `PATH`. Their notice still tells a shell on another Node.js to run `nvm use` before running `npm` or `node` directly. In such a shell, `nvm use` does not put the pinned version first either, so the advice is wrong there. The worker found this during that change, and the coordinator (Niki) assigned the fix on 2026-10-25.

## What Changes

- The notice tells the user to run `nvm use` and check that `node -v` prints the pinned version, and otherwise to run the printed `export PATH='<directory>':"$PATH"` line, with the directory single-quoted so that the shell takes it literally. The directory is that of the Node.js the checks ran under, which is the one the make targets put first.
- `scripts/doctor.ts` and `scripts/setup.ts` pass that directory to the notice.
- The test of the notice and the README sentence on direct `npm` and `node` use follow the new text.

## Capabilities

### New Capabilities

### Modified Capabilities
- `development-environment`: the scenarios "Shell on another Node.js after setup" of "Environment check" and "Shell on another Node.js" of "Environment setup" describe the new notice; the requirement texts are unchanged.

## Impact

`scripts/environment-checks.ts`, `scripts/doctor.ts`, `scripts/setup.ts`, `test/environment-checks.test.ts`, `README.md`, and the spec. The published package is not affected, so the commit type is `build`. No new dependency.
