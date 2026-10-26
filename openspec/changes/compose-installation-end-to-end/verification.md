## Scope and source

G2 work item 23, second part (23b), `compose-installation-end-to-end`, assigned by the coordinator on 2026-10-26: the end-to-end smoke (submit, assign, execute) and anything the later runtime needs, with the 20d2 obligation that the Linux worker image always sets `TASKELITH_CONTAINMENT_PARENT` with a delegated cgroup v2 subtree. Excluded: item 24 failure scenarios, item 25 native acceptance, TLS (G3), macOS worker work, item 20e2, and any contract change. Sources: [docs/g2-plan.md](../../../docs/g2-plan.md) item 23 and D5; the [23a proposal](../archive/2026-10-25-compose-minimal-local-installation-images/proposal.md); the [20d2 design](../archive/2026-10-26-implement-worker-contact-and-offline/design.md) OQ2; the [supervisor identity contract](../../../docs/contracts/supervisor-identity.md) section 8.

## Revision and environment

- Base: `origin/dev` at `311c40d`. Branch `compose-installation-end-to-end`.
- Host: macOS 26 (Darwin 25.6.0), x86_64; Docker Desktop, engine 29.5.2, cgroup v2; Node.js from `.nvmrc`. Docker disk at 53% before and after the runs.

## Author self-check and evidence check

- No OpenAPI, AsyncAPI, JSON schema, product code, or npm dependency changes; `apps/worker` and `apps/control-plane` are unchanged. `setpriv` comes from `util-linux` in the Ubuntu base; Docker's init is part of the engine and pulls no image.
- In the worker image with the composition's settings, the worker's process status showed `CapPrm`, `CapEff`, and `CapBnd` `00000000000000e0` (`KILL`, `SETGID`, `SETUID`) and `CapAmb` 0, its cgroup `0::/init`, an empty namespace root, and `init/` and `executions/` beside each other; a process under uid 10003 got `Permission denied` writing `init/cgroup.procs`.
- The first smoke attempt failed: the entrypoint read `cgroup.procs` while moving processes out of it, so it skipped one. The entrypoint now moves a copy of the list. That attempt also exercised the failure path: the logs were printed, and the project, its volumes, and its images were removed.
- No log of the smoke contains a `tkop_` or `tken_` value.

## Checks

| Check | Result |
| --- | --- |
| `npm run openspec -- validate compose-installation-end-to-end --strict` | valid |
| `make installation-smoke` | passed on 2026-10-26: built, bootstrapped, started, enrolled; the stored result was `ended`, outcome `exited`, status code 0, `startProven` true; the project was removed with its volumes and images, and nothing was left |
| `make verify-installation` | passed on 2026-10-26: built, bootstrapped, started, enrolled, restarted, removed |
| `make verify` | passed; 1714 tests, 1712 passed, 2 skipped, 0 failed; coverage 99.27 % lines, 91.87 % branches, 98.98 % functions |

Excerpt of the smoke output:

```text
{"state":"ended","runId":"installation-smoke-run","taskId":"installation-smoke-task","attemptId":"t900d427…","ownershipGeneration":2,"outcome":{"cancelled":false,"ownershipGeneration":2,"endedAt":"2026-10-26T13:38:04.872Z","kind":"exited","executionId":"bde5581a-19b5-4a17-9686-769f9bfd6f84","status":{"kind":"code","code":0},"startProven":true},"evidence":[]}
installation.sh: submitted, assigned, executed, stored the result, removed
```

## Independent review

Pending: the coordinator assigns the reviewer and records the passes here.

## Limitations and remaining gates

- The worker runs as root with three capabilities inside its container, replacing the 23a requirement that it run as `taskelith` (design decision 3); this needs the coordinator's or the owner's acceptance.
- The smoke and the bring-up check ran on Docker Desktop x86_64 only; Linux hosts with AppArmor or SELinux, and linux/arm64, are not yet observed. Item 25 qualifies the container settings.
- Independent review and integration remain.
