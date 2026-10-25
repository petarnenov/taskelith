# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

G2 work item 10 in [docs/g2-plan.md](../../../docs/g2-plan.md), assigned by the coordinator under the agent task protocol. The branch was created from `origin/dev` at `30e7675`; `origin/dev` at `9fb1c00`, which contains item 9 (`establish-g2-runtime-workspace`), was merged into it in `4f27f94`. After the coordinator returned the branch under protocol step 9, `origin/dev` at `f4bb27a` (items 7 and 2) was merged in `475184a`, and the dependency inventory was regenerated in `57a6bc4`. Scope: the private workspace package `packages/testing` (`@taskelith/testing`) with its tests, the boundary rule that keeps it out of product sources, the Toxiproxy service and its routes in `infra/services/`, the exported URLs in `scripts/services.sh`, the partition integration test, and updates to the architecture's package layout, the README, the Makefile comment, and the Toxiproxy and `pg` rows of the dependency register. The change adds the `deterministic-test-harness` capability and modifies `development-environment`.

The coordinator confirmed design decision 2 (ports stay with the modules; no `Clock` in the kernel) before the services work.

## Author self-check before review

Checked against the ADR 0004 principles:

- Clean Code: one primitive per source file, small functions, validation in constructors and guards, comments only for rationale and contracts.
- SOLID and hexagonal architecture: the harness depends at runtime only on the kernel and Node built-ins; it satisfies module-owned ports structurally (a test assigns its wall clock to the SDLC module's `Clock`); the boundary check rejects imports of it from product sources, including the kernel and the root package.
- Microkernel: no harness, provider, SCM, or SDLC framework is named in the package.
- Docker and Makefile: Toxiproxy runs pinned by its index digest in the item 9 Compose project through `make test`, `make services-up`, and `make verify`; the Compose change adds only the new service.
- OpenAPI: the change defines no wire contract.
- OpenSpec: this change tracks the work; strict validation passes.
- Coverage: every compiled module of the package has 100% line and function coverage; branch coverage is 96–100%.
- Dependencies: no new npm dependency; the partition test uses the item 9 pins `pg@8.23.1` and `@types/pg@8.23.1` as development dependencies of `@taskelith/testing`. One image, Toxiproxy, is used as the item 1 evaluation proposed and decision D8 (a) selected.

Evidence check: the Toxiproxy image digest is the index digest that [docs/g2-infrastructure.md](../../../docs/g2-infrastructure.md) section 7 records; Docker pulled it by that digest. The API behavior that section 7 marked unverified (disable, `timeout` toxic with `timeout: 0`, `/reset`, error bodies) was checked against the running image: first manually against a TCP echo route (`disconnect` closed the connection, `blackhole` left it silent, `heal` restored it, a duplicate proxy returned 409), then by the integration test below.

## Checks

Environment: macOS (Darwin 25.6.0, arm64), Node v24.22.1, npm 12.2.1 (through `make verify`), Docker Engine 29.6.1, Docker Compose v5.2.0.

- Before the merge of item 9, `npm test` passed 315 tests with 98.54% line coverage; the harness modules other than `toxiproxy.js` had 100% line coverage.
- After the merge and the services work, on `7183ebd`: `make verify` passed: comment rule, the workspace package contract and boundary checks, 332 tests (including the five Toxiproxy integration tests and item 9's two service tests against a Compose project of their own), coverage 99.66% lines, 96.06% branches, 99.42% functions over all compiled product modules, `toxiproxy.js` at 100%, contract compatibility, dependency inventory, strict OpenSpec validation (39 items), the archive dry run, and package verification. A first run failed in the archive dry run because the modified `development-environment` requirement exceeded 500 characters; it was shortened in `7183ebd`.
- After the pass 1 fixes, on `51a1c5e`: `make verify` passed again with 332 tests and 99.66% lines, 96.07% branches, 99.42% functions.
- After the pass 2 fixes, on `af67338`: `make verify` passed with 332 tests and 99.66% lines, 96.07% branches, 99.42% functions; every harness module has 100% line and function coverage.
- After the merge of items 7 and 2, on `57a6bc4`: the only conflict, the G2 infrastructure paragraph of `docs/dependencies.md`, was resolved as the coordinator directed (the item 9, item 2, and item 10 sentences, then one sentence that the published package includes none of them); `npm ci --ignore-scripts` and `make dependency-inventory` regenerated the inventory (701 package paths). `make verify` passed: 431 tests, including the Toxiproxy partition test against item 2's changed `nats-server.conf`, coverage 99.73% lines, 96.66% branches, 99.58% functions, and strict OpenSpec validation (42 items).

## Independent review

Assigned reviewer: Claude Code 2.1.310 with `claude -p --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, the prompt passed on stdin and run from the worktree. The prompt and output files were kept in a scratch directory outside the worktree. The prompt named `AGENTS.md`, ADR 0004, the governance review process, the G2 plan row and decision D8, the contracts and architecture sections the harness serves, and the specifications the change touches, and asked for every instance of a problem with severity, file, line, and fix.

- **Pass 1 — session `f083c4fd-bfd8-4f7c-b267-c34a02f19edf`, reviewed `7183ebd` (diff `9fb1c00...HEAD`).** `modelUsage` lists `claude-fable-5-1` (with `claude-opus-5-5` and `claude-haiku-5-5` for the CLI's auxiliary calls). SHA-256 snapshots of `git ls-files -co --exclude-standard` before and after the pass were equal (`ded4d892…75ff6`). The reviewer reran strict validation, the comment, boundary, and archive checks, and the harness unit tests (the process tests eight times without a failure), and checked the Toxiproxy Dockerfile for `/toxiproxy` and `/toxiproxy-cli`. Findings: 0 Critical, 0 High, 2 Medium, 10 Low. Resolutions, in `51a1c5e`:
  1. Medium: `verification.md` was missing and task 3.1 open. This record was added.
  2. Medium: the boundary test did not cover scripts, application tests, harness fixtures, the root `src/`, or the kernel. The test now covers each, and the specification scenarios name them.
  3. Low: `Toxiproxy#request` was public. It is private; proxies receive a request function.
  4. Low: a path prefix in the API URL was dropped. Request paths are now appended to the URL's path.
  5. Low: a second `blackhole` without `heal` fails with 409, undocumented. The comment states it.
  6. Low: signals to a group that is gone throw `ESRCH`, undocumented. The comment states it.
  7. Low: the crash fixture wrote stdout asynchronously before a `SIGKILL`. It writes with `writeSync`.
  8. Low: the failed-call test did not check the response body that the specification names. It now matches `proxy not found`.
  9. Low: the integration test repeats item 9's endpoint reading and NATS greeting helper. Not changed: sharing them means moving test helpers out of `apps/control-plane`, outside this item's scope; listed as a follow-up.
  10. Low: data other than INFO was labeled `closed`. It is labeled `unexpected`.
  11. Low: `"types": ["node"]` repeated the root setting. The package `tsconfig.json` no longer overrides it.
  12. Low: a file owned by no package and not development code would be reported as product code. The rule now ignores such files.
- **Pass 2 — session `f499f7af-7add-4ea1-bd34-efdb47258ea6`, reviewed `58e2005` (diff `9fb1c00...HEAD`).** `modelUsage` lists `claude-fable-5-1` (with `claude-opus-5-5` for auxiliary calls). Snapshots before and after were equal (`1f3d9f48…cf5ee`). The prompt named pass 1's session and asked for each resolution first. The reviewer confirmed findings 1 to 8 and 10 to 12 as resolved and accepted the deferral of finding 9, reran strict validation, the comment check, the type check of tests, the harness unit tests three times and the boundary tests, and recomputed the Mulberry32 reference sequence for seed 0. Findings: 0 Critical, 0 High, 0 Medium, 9 Low. As the review process allows for a Low-only pass, all were fixed in `af67338` without another pass; **these fixes have not been independently reviewed**:
  1. `exited` waits for stdio, which a descendant holding stdout keeps open. Documented in the class comment; resolving on `exit` instead would let output arrive after `exited`.
  2. The one-second polling limit could fail on a loaded runner. It is five seconds; the loop still ends at the first success.
  3. An exported `TASKELITH_CRASH_POINT` in the developer's shell would arm the unarmed child. The test clears it before applying the scenario's environment.
  4. A non-null assertion and an unreachable `throw` after `SIGKILL` hid the invariant. The armed crash is looked up as a value, and `crash` switches on the action.
  5. Toxic names from the server entered the path unencoded. They are encoded.
  6. API calls had no timeout. Each has a five-second `AbortSignal.timeout`.
  7. The runtime dependency rule of the harness had no automatic check. The boundary check now rejects runtime imports from `packages/testing/src/` other than the kernel and Node built-ins (type-only and relative imports are allowed), with a test and a scenario.
  8. The scenario listed fewer product locations than the rule rejects. It now names `src/` of any workspace package or application and the root `src/`.
  9. The follow-up of pass 1 finding 9 had no home. It is recorded under remaining gates.
- **Pass 3 — session `d4558489-3158-48ef-a9ab-8a19fe255dcb`, limited to the conflict resolution (protocol step 9): the merge `475184a` and the regenerated inventory `57a6bc4`.** `modelUsage` lists `claude-fable-5-1`. Snapshots before and after were equal (`00cb60f2…a7e50`). The reviewer checked the remerge diff (one conflicted paragraph, the directed union), compared the regenerated inventory with `dev` (only provenance hashes and the `@taskelith/testing` component differ), found no change from `dev` to the boundary check, the Compose file, `scripts/services.sh`, the workspaces, or the test globs, and named item 2's `nats-server.conf` as the one shared input of the partition test; it reran strict validation (42 items), the boundary, archive, and dependency checks, and the harness unit and boundary tests. Findings: 0 Critical, 0 High, 0 Medium, 1 Low: this record did not describe the merge or the `make verify` run after it. Fixed by the entries above for the merge and its checks, and this one; **this fix has not been independently reviewed**.

## Limitations

- The `SIGKILL` crash path and the process-group signals run in child processes, which the coverage of the test process does not measure; their behavior is asserted from exit signals, output, and `ps` states.
- Checks ran on macOS arm64 only; Linux runs in CI and in later native acceptance (item 25).
- Power-loss simulation, latency toxics, and runtime creation of routes are out of scope (design non-goals).

## Remaining gates

Follow-up for a later item (11 or 12, the next to add integration tests): move the service endpoint reading, the remedy text, and the NATS greeting helper of `apps/control-plane/test/integration-services.ts` and `packages/testing/test/toxiproxy.integration.test.ts` into `@taskelith/testing`. Integration into `dev` and archive by the coordinator; promotion to `main`.
