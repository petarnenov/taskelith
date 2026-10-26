# Verification: define-scm-port

Date: 2026-10-26. Author verification and independent review are recorded below.

## Scope and source

G3 item 7 of the [G3 work plan](../../../docs/g3-plan.md). The coordinating session (Niki) assigned it on 2026-10-26, after the owner started the first wave of G3 contracts (items 3, 5, 6, 7, and 8), and placed the port in the `@taskelith/integrations` module, which item 8 also adds to. Base revision: `c89cf6c` on `dev`. Prepared in its own git worktree from a fresh `origin/dev`. After pass 2, `origin/dev` at `cd2805e`, which contains item 8 (`define-product-ports`), was merged into the branch (`21d7166`); see [Merge of dev](#merge-of-dev).

Scope:

- the contract `docs/contracts/source-control.md`;
- in the module package `packages/modules/integrations/`, which item 8 created: the port (`src/ports/source-control.ts`), the port entry (`src/port.ts`) and its `./port` export, the root export additions (`src/index.ts`), the conformance suite and its helpers under `src/ports/`, and the tests with a test-only in-memory SCM under `test/`;
- this change.

`package-lock.json` and the dependency inventory end up equal to `dev`'s, because item 8's skeleton already has the package's dependencies.

Excluded, as the plan row states: the GitHub plugin (item 20). Also excluded: the plugin SDK re-export and the plugin API version, wire contracts, and the module's use cases (see `design.md`).

## Environment

Linux 6.8.0 x86_64, Node.js from `.nvmrc` through `nvm use`, the pinned `@fission-ai/openspec` through `npm run openspec`.

## Author self-check before review

- ADR 0004:
  - Three small ports for their clients, combined only in the plugin-facing `SourceControlProvider` (SOLID).
  - Module code, types, and tests name no SCM; the mapping to GitHub and Forgejo is only in `design.md` (microkernel).
  - The port entry exports only the port types and constants, like `@taskelith/sdlc/port`, and a test follows its compiled imports (hexagonal).
  - Principles 5 (Docker), 6 (OpenAPI), and 7 (Makefile) add no obligation: there is no new interface or image, and `make verify` runs the new tests.
- Scope: no SCM I/O and no GitHub plugin. The plan row's required elements map to the spec as follows:
  - credentials, refresh, and the check that a credential without write permission cannot write: "Per-run credentials" and "Credential refresh and revocation";
  - change requests, statuses, and merge methods, with merge blocking that binds the plugin and a refused merge while a required status is pending: "Merge blocking that binds the plugin" and "Merge of the reviewed head";
  - D8: "Review evidence as a required status";
  - webhooks: "Webhooks verified on the raw body";
  - identifiers: "Opaque SCM identifiers";
  - Forgejo: the mapping in `design.md`.
- Comments: every comment the change adds is at most two lines of at most 80 characters; `npm run verify:comments` passes.
- Honest status: the port is a draft, `0.1.0`. `design.md` states that the Forgejo mapping is an unsourced assumption, lists its unconfirmed conditions, and states that the suite has run only against a test-only fake.
- Evidence check: the change, the contract included, has no external link; it links only repository documents, and each relative link resolves to an existing file. The GitHub column of the mapping follows the GitHub qualification record. No external source was consulted.

## Merge of dev

Item 8 added `@taskelith/integrations` in `dev` while this change was in review, so the merge conflicted in the package skeleton (`package.json`, `tsconfig.json`, `src/index.ts`) and in `package-lock.json`. Resolution:

- `package.json`: item 8's dependencies and dev dependencies with this change's `./port` export; `tsconfig.json`: item 8's references.
- `src/index.ts`: item 8's exports followed by this change's.
- `package-lock.json`: `dev`'s, then `npm install --package-lock-only --ignore-scripts`, which changed nothing; `make dependency-inventory` regenerated the inventory to `dev`'s.
- Naming aligned with item 8: the port's `MergeRequest` collided with item 8's queue record and became `ChangeRequestMerge`.
- The contract document that item 8's precedent and the coordinator's brief call for, `docs/contracts/source-control.md`, was added; the GitHub and Forgejo mapping moved there from `design.md`.

These changes alter the contract and its inputs, so pass 3 reviews the whole change again ([evidence freshness](../../../docs/governance.md#evidence-freshness)).

## Checks

Recorded for the final revision in [Final checks](#final-checks).

## Independent review

Reviewer assigned by the coordinator: Codex CLI, `gpt-6.1-sol`, reasoning effort `medium`, read-only sandbox. Each pass ran from the task's worktree with the prompt in a scratch file outside it.

### Pass 1

- Invocation: `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`.
- Reviewed revision: `066f4f0`.
- Confirmation: the output header shows `model: gpt-6.1-sol`, `sandbox: read-only`, `reasoning effort: medium`, and session ID `01a175ba-e471-7dc1-9122-9f5e5ee918ab`.
- Snapshot: `98d4d2f98ce89e54365b90d85825d9a7ca9592ffc24a0bcd687574cd74e15bd6` before and after; unchanged.
- Findings: Critical 0, High 2, Medium 10, Low 1.

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | High | A refused merge was checked only by its `Result`, so a plugin that merged and reported a refusal passed. | After each expected refusal, the suite reads the change request (still `open`) and the base branch head through the new fixture helper `readBranchHead` (unchanged). |
| 2 | High | Only a pending review status was tested, so a plugin that ignored the verification status, or treated `failure` and `error` as success, passed. | Each required context is tested on its own while it is missing, `pending`, `failure`, and `error`, with the others successful, through the port and the native bypass. |
| 3 | Medium | Any bypass failure counted as protection, without a positive control. | A bypass must fail with `forbidden` or `precondition-failed`; the same helper must merge a change request whose statuses all succeed. |
| 4 | Medium | A no-op refresh passed. | The refreshed expiry must be later than the original's; spec and design say so. |
| 5 | Medium | Refresh and revocation lacked native probes. | The refreshed credential is probed in and outside the project; a write succeeds just before revocation and fails after it. |
| 6 | Medium | Only the project's merge method was merged; a declared but unsupported method passed. | Every declared method merges a fresh change request; every undeclared one fails with `unavailable` and leaves the change request open. |
| 7 | Medium | A constant delivery identifier passed. | Two distinct deliveries must yield different identifiers, each kept on redelivery. |
| 8 | Medium | Repository and branch fields of results were not checked. | Every identifying field of change requests, statuses, and merge results is compared with the request. |
| 9 | Medium | `Failure.details` and the revoke value were not validated. | The full `Failure` is validated, and revocation must return no value. |
| 10 | Medium | An extra required context kept by the service made a conforming plugin fail. | Positive merges first set every returned required context to `success`. |
| 11 | Medium | The suite required a canonical instant that the port did not state. | The port, spec, and design state the kernel instant format. |
| 12 | Medium | `verification.md` was missing before the first pass. | Added. The author self-check above was performed before pass 1 but recorded after it. |
| 13 | Low | The Forgejo mapping had no sources. | `design.md` states that the mapping is an unsourced assumption and lists each unconfirmed condition per row; the Forgejo plugin must source it at a pinned version. |

### Pass 2

- Invocation: as in pass 1, with a prompt that names the pass 1 session and asks for each finding's resolution before a full review.
- Reviewed revision: `7603d09`. `make verify` passed on it before the pass (1406 tests, 0 failures; coverage of all files 99.05% lines, 91.47% branches, 98.46% functions).
- Confirmation: `model: gpt-6.1-sol`, `sandbox: read-only`, `reasoning effort: medium`, session ID `01a175cb-5a14-7c40-b5d6-b55ffbb837e2`.
- Snapshot: `a77bd4111ce511df34f9e31b11abd83335fc86b3cfdfbb8b49656ff8930b079f` before and after; unchanged.
- Pass 1 findings: 1, 3, 5, 7, 9, 10, and 11 resolved; 6, 8, and 12 resolved for the reported defect; 13 addressed by an explicit limitation; 2 and 4 partly resolved, carried into findings 2 and 8 below.
- Findings: Critical 0, High 3, Medium 6, Low 0.

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | High | A verifier that checked only that signature headers were present passed. | The fixture names its signature header and signs with another secret; an unchanged body with that signature, and a delivery without only the signature header, must fail with `forbidden`. |
| 2 | High | A required context that the service already had could be ignored. | The blocking matrix covers every context the protection reports. |
| 3 | High | Status and head protections were checked with one merge method only. | For every declared method, a pending status in each required context and a moved head must be refused. |
| 4 | Medium | The method actually used was not checked. | The fixture observes a merge's method natively, and it must equal the requested one. |
| 5 | Medium | A fabricated merge commit passed. | The merge commit is the base branch head after the merge, compared with the service; the port and spec say so. |
| 6 | Medium | An invalid read-only secret passed as a restricted one. | Read-only and write credentials must read the project's repository through the new fixture helper `attemptRead` before the write checks. |
| 7 | Medium | The design allowed effective supersets that the suite always refused. | One rule in spec, design, and suite: effective permissions cover the request and may exceed it, except `write-code` for a credential requested without it. |
| 8 | Medium | A refresh could extend only the declared expiry. | A refresh returns a new secret and ends the previous one; the suite checks both on the service. Waiting for the original expiry is left to item 20 (Limitations). |
| 9 | Medium | Credentials of concurrent runs were not checked for isolation. | Two runs' credentials are issued at once; neither widens the other, and revoking one leaves the other usable. |

### Pass 3

- Invocation: as in pass 1, with a prompt that names the pass 2 session, asks for each pass 2 finding's resolution, and then for a review of the whole change, including the merge of `dev`.
- Reviewed revision: `57f8c24`. `make verify` passed on it before the pass (1468 tests, 1453 passed, 0 failed, 15 skipped; coverage of all files 99.08% lines, 91.39% branches, 98.50% functions).
- Confirmation: `model: gpt-6.1-sol`, `sandbox: read-only`, `reasoning effort: medium`, session ID `01a17730-f75d-79f3-9e41-fb2888a270a3`.
- Snapshot: `c629b41f73987dd452f64952bab5be697a04680ec8e3a654bf5728b96f2e50b5` before and after; unchanged.
- Pass 2 findings: 1, 2, 4, 5, 6, 7, and 9 resolved; 8 resolved for the reported defect; 3 partly resolved, carried into finding 1 below. The merge resolution and the `ChangeRequestMerge` rename raised no finding.
- Findings: Critical 0, High 2, Medium 2, Low 1.

| # | Severity | Finding | Resolution |
| --- | --- | --- | --- |
| 1 | High | Missing, `failure`, and `error` required statuses are checked only with the fixture's merge method; other declared methods get only `pending` and a moved head. | Open: the third pass is the last, so the owner decides (see [Remaining gates](#remaining-gates)). |
| 2 | High | Repository scope is not checked for reads: no credential's read outside the project is checked. | Open, as finding 1. |
| 3 | Medium | Refresh and revocation check only that writes end, not reads, and the revoked read-only credential of the isolation case is not checked. | Open, as finding 1. |
| 4 | Medium | `write-change-requests` and `write-statuses` are never requested or checked on the service. | Open, as finding 1. |
| 5 | Low | The contract listed wave 7 of the plan as the items that build on the port; the items that depend on item 7 are 9 and 20. | Unreviewed fix: the contract names items 20 and 9. |

## Final checks

Pending.

## Limitations

- The conformance suite has run only against a test-only in-memory SCM and its defective variants; item 20 runs it against GitHub.com with the plugin's own credential.
- The Forgejo mapping is unverified.
- The suite does not wait for a credential's original expiry; item 20 records a run that outlives it.
- The Forgejo and GitHub mapping was reviewed against repository records ([ADR 0006](../../../docs/decisions/0006-github-first-scm.md) and the [GitHub qualification](../../../docs/qualification/github.md)) without network access, because the assigned reviewer has none.

## Remaining gates

- The owner's decision on the High and Medium findings left after pass 3: fix them without review, accept them as a known risk, or defer them; a fourth pass needs the owner's permission.

- Integration into `dev` and the archive by the coordinator.
- Item 20 runs the suite against GitHub.com; Forgejo's admission confirms the mapping.
