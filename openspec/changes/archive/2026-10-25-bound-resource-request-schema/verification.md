# Verification: bound-resource-request-schema

## Scope and source

Assigned by the coordinator (Niki) on 2026-10-25 to the worker Ziki, as a G2 follow-up of `bound-worker-capacity-schema`, whose verification record listed the unbounded `ResourceRequest` as a limitation. Base revision: `f83e36d` on `dev`. Scope: `ResourceRequest` in the execution AsyncAPI document and its version, the contract page, a contract test, the spec delta, and this change. Prepared in the git worktree `../taskelith-worktrees/bound-resource-request-schema` on branch `bound-resource-request-schema`. The published package is unchanged, so the commit type is `chore`.

## Environment

Ubuntu 24.04.5 LTS, Linux 6.8.0-147-generic, x86_64; Node.js v24.22.0 and npm 11.19.1 through nvm; Docker Engine 27.3.1, Compose v2.29.7.

## Author self-check before review

- The bound matches the `integer` columns `cpu_millicores` and `memory_mebibytes` of the `assignments` table (migration `1792930000000_resource-admission.sql`).
- `ResourceRequest` is defined only in `execution.asyncapi.json` and used only by `reservation.requested` of `AssignmentOfferPayload`. No other contract document defines a schema of that name or another requested-resource field; the `cpuMillicores` and `memoryMebibytes` of `execution.openapi.json` belong to `WorkerCapacity`, which is already bounded.
- The per-attempt ceiling of the capacity reservation contract (`2 vCPU`, `4 GiB`) is tighter and stays unchanged: it is a capacity rule with the reason `resource-ceiling-exceeded`, which `decidePlacement` enforces before `placeInTransaction` inserts the assignment and its offer.
- No hand check compares these values with the integer bound, so none is removed. `parseResourceRequest` checks only that the values are positive integers, on values the scheduler builds.
- The generated contract types do not change: a maximum does not change the TypeScript type.
- Evidence check: the change adds no external link or external evidence.

## Checks

- `make contract-compatibility` with the maximums and version 0.2.0 failed: `execution.asyncapi.json` had 14 breaking changes over 0.2.0 (the added `maximum` at each path that reaches `ResourceRequest` through the `assignmentOffer` message); the other three documents had none. With 0.3.0 it passed in `make verify`.
- `node --experimental-strip-types --test packages/contracts/test/execution-contracts.test.ts` after `npm run build`: with the AsyncAPI document of `f83e36d`, 20 passed and 1 failed (the new test); with the change, 21 passed, 0 failed.
- `npm run openspec -- validate bound-resource-request-schema --strict` passed. A first `make verify` failed in `verify:archive` because a `MODIFIED` copy of "Execution commands" exceeded 500 characters; the delta now adds the separate requirement "Requested resource bounds".
- `make verify` at `cca9d2a` passed (998 tests, 983 passed, 0 failed, 15 skipped on macOS-only tests; coverage 99.04% lines, 91.57% branches, 98.63% functions; contract compatibility passed; strict OpenSpec validation 55 passed, 0 failed).

## Independent review

Reviewer: Codex (`gpt-6.1-sol`), reasoning effort medium, read-only sandbox, as assigned by the coordinator, run from the worktree as `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, with the prompt and log outside the worktree.

- **Pass 1 — session `01a1743e-6825-7b52-ab2e-54f4be761235`, head `cca9d2a`.** The header confirmed the model, reasoning effort medium, and the read-only sandbox; the snapshot (`git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256`) was `6f689646…db7f7b` before and after the pass. The reviewer confirmed the schema change, version 0.3.0, the 14 breaking paths, and the boundary tests; with the maximums removed in memory, `2147483648` was accepted. Its full `make contract-compatibility` run stopped with `EROFS` in the read-only sandbox. Findings: 0 Critical, 0 High, 1 Medium, 3 Low.
  - Medium: this record was missing before the pass. Resolved: this file.
  - Low: `design.md` said the ledger sums the values in the same type, but `heldOnWorker` sums without a cast. Resolved: the claim is removed.
  - Low: `design.md` said the worker enforces the ceiling, but the worker has no behavior yet. Resolved: the scheduler's enforcement and the contract requirement on the worker are stated separately.
  - Low: `design.md` said a larger value from an old peer failed at the database. Resolved: it now states only that wire validation refuses such a value and offers from the placement path stay valid.
- **Pass 2 — session `01a17443-811a-7483-af35-415d7d373923`, head `1dbbc08`.** The header confirmed the model, reasoning effort medium, and the read-only sandbox; the snapshot was `4e0ffc90…f5e6d48b` before and after the pass. The reviewer confirmed the resolution of each pass 1 finding, the boundary tests (21 contract tests passed), the 14 breaking paths and version 0.3.0, that only the AsyncAPI document defines `ResourceRequest`, that the per-attempt ceiling is unchanged, and that no hand check is left to remove. Findings: 0 Critical, 0 High, 0 Medium, 1 Low.
  - Low: "Remaining gates" omitted the open review while it was in progress. Resolved without another review, as a Low-only pass allows: the review is complete with this entry, and task 2.3 is checked. This record entry and `tasks.md` are the only changes after pass 2, unreviewed; `make verify` ran again in the `pre-push` hook of the handoff push.

## Limitations

- The worker's enforcement of the per-attempt ceiling is a contract requirement that is not implemented yet; this change does not touch it.

## Remaining gates

- Coordinator integration into `dev` and archive.
