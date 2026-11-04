## 1. Diagnose

- [x] 1.1 Collect the past partition failures from the `make verify` logs and compare them with the mechanism of #446.
- [ ] 1.2 Run the base scenario file under load with the control plane's and the worker's logs saved.
- [ ] 1.3 Reproduce the failure deterministically by delaying the worker's start publication past the process's exit.

## 2. Fix

- [x] 2.1 Hold the scripted process of the broker partition while-running scenario until the worker is offline.
- [x] 2.2 Add the scenario "Exit while the worker is offline" to "Worker broker partition".

## 3. Verify

- [ ] 3.1 Show that the reproduction no longer fails the fixed scenario, and run the fixed file 30 times, 15 under a CPU hog.
- [ ] 3.2 Run `npm run openspec -- validate stabilize-g2-partition --strict`, `make verify`, and `make verify-linux-g2-scenarios`.
- [ ] 3.3 Independent review, recorded in `verification.md`.
