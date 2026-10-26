## Scope and source

G2 work item 24, first part (24a), `run-g2-failure-scenarios-composition`, assigned by the coordinator on 2026-10-26: the fresh-composition happy path on arm64, a results recorder that 24b and 24c adopt, worker disk loss in Compose ending in re-enrolment, and an untimed `SIGKILL` of the worker container with a check of reconciliation. Excluded: the process-launch crash windows (24b, `run-g2-crash-windows`), partition and reconnect, cancellation races, stale generations, and duplicate delivery (24c, `run-g2-partition-and-races`), product code, and any contract change. Sources: [docs/g2-plan.md](../../../docs/g2-plan.md) item 24; the [harness archive](../archive/2026-10-25-build-deterministic-test-harness/proposal.md); the [item 23b archive](../archive/2026-10-26-compose-installation-end-to-end/proposal.md).

## Revision and environment

- Base: `origin/dev` at `f9ba7a5`. Branch `run-g2-failure-scenarios-composition`.
- Phase 1 host: macOS 26 (Darwin 25.6.0); Node.js from `.nvmrc`.

## Author self-check and evidence check

Phase 1 (the recorder only):

- No product code, OpenAPI, AsyncAPI, JSON schema, or npm dependency changes. The recorder uses Node built-ins only, and `isSeed` of the harness is reused.
- The recorder writes only when `TASKELITH_SCENARIO_RESULTS` is set, so `make verify` leaves the tree unchanged.

## Checks

| Check | Result |
| --- | --- |
| `npm run openspec -- validate run-g2-failure-scenarios-composition --strict` | valid (phase 1) |
| `make verify` | phase 1 passed on 2026-10-26; 1759 tests, 1757 passed, 2 skipped, 0 failed; coverage 99.26 % lines, 91.87 % branches, 98.89 % functions; `scenario-results.js` 100 % lines, 92.59 % branches, 100 % functions |

## Independent review

Pending.

## Limitations and remaining gates

- The Compose scenarios (tasks 2.1 to 2.4) are not yet implemented or run.
- Remaining gates: the scenario evidence runs, the independent review, integration by the coordinator, and the archive.
