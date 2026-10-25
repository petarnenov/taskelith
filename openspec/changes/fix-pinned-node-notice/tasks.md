## 1. Fix

- [x] 1.1 Make `shellNodeNotice` name `nvm use` with a `node -v` check and the `export PATH` line of the checks' Node.js directory, and pass that directory from `scripts/doctor.ts` and `scripts/setup.ts`.
- [x] 1.2 Update the notice test, add a test that runs the printed line with `sh` for directories with special characters, and update the README sentence.
- [x] 1.3 Update the two `development-environment` scenarios.

## 2. Verification

- [x] 2.1 Run `make doctor` on the Linux host under its own `PATH` and run the printed line in a shell.
- [x] 2.2 Run `make verify`.
- [x] 2.3 Pass the independent review and record it in `verification.md`.
