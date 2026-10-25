## 1. Fix

- [x] 1.1 Put the pinned Node.js directory first in `PATH` in `scripts/with-pinned-node.sh` after a successful `nvm use` or `nvm install`.
- [x] 1.2 Add `test/with-pinned-node.test.ts` with a fake Node.js earlier in `PATH`, for the use and install modes and for a missing pin.
- [x] 1.3 Add the scenario "Another Node.js earlier in PATH" to the `development-environment` requirement "Environment check".

## 2. Verification

- [x] 2.1 Show that the new test fails without the fix and passes with it.
- [x] 2.2 Run `make doctor`, `make setup`, and `make verify` on the Linux host under its own `PATH`.
- [ ] 2.3 Pass the independent review and record it in `verification.md`.
