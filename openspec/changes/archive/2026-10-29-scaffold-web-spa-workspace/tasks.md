## 1. Change

- [x] 1.1 Create the change, save the brief's `checklist.json` (`--size M-L`), and add the empty `findings.jsonl` and `passes.jsonl`
- [x] 1.2 Record the coordinator's split and decisions D1 to D5 verbatim in the design

## 2. Implementation and tests

- [x] 2.1 Add the exact-pinned development dependencies of `apps/web` with the lockfile, the license reviews, and the regenerated inventory in one commit
- [x] 2.2 Scaffold `apps/web`: TypeScript configurations, the Vite build under `/app/`, the Vitest configuration with 75% thresholds, the scaffold page, and the development server options
- [x] 2.3 Generate the control-plane types with a drift check and write the typed fetch with the CSRF header on every request other than GET
- [x] 2.4 Add the browser application contract, its build, its Vitest coverage scope, and its exclusion from Node's test runner and `tsconfig.check.json`
- [x] 2.5 Extend the web boundary rules and add the bundle check over the built `dist/`
- [x] 2.6 Add `make web-build`, `make web-test`, and `make web-dev`, and wire the type drift check and the Vitest tests into `make verify`
- [x] 2.7 Tests for each behavior and exemption, with fail-before runs

## 3. Records and checks

- [x] 3.1 Write the proposal, the design, the spec deltas, this task list, the dependency register rows, the `docs/g3-plan.md` row 28 split, and the README section
- [x] 3.2 Measure the installation image size before and after
- [x] 3.3 Route the change, run `make verify`, and write `verification.md`

## 4. Review and archive

- [x] 4.1 Review passes recorded in `passes.jsonl`, `findings.jsonl`, and `verification.md`
- [x] 4.2 Architect check by the coordinator of any unreviewed fixes
- [x] 4.3 Archive the change in the last commit of the branch
