# Verification: define-scm-port

Date: 2026-10-26. Author verification and independent review are recorded below.

## Scope and source

G3 item 7 of the [G3 work plan](../../../docs/g3-plan.md). The coordinating session (Niki) assigned it on 2026-10-26, after the owner started the first wave of G3 contracts (items 3, 5, 6, 7, and 8), and placed the port in the new `@taskelith/integrations` module, which item 8 also adds to. Base revision: `c89cf6c` on `dev`. Prepared in its own git worktree from a fresh `origin/dev`.

Scope:

- the new module package `packages/modules/integrations/`: the port (`src/ports/source-control.ts`), the port entry (`src/port.ts`), the root export (`src/index.ts`), the conformance suite and its helpers under `src/ports/`, and the tests with a test-only in-memory SCM under `test/`;
- the workspace entries in `package-lock.json` and the regenerated `docs/dependencies/licenses.json` and `docs/dependencies/sbom.cdx.json`;
- this change.

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
  - credentials, refresh, and the check that a credential without write permission cannot write: "Per-run credentials";
  - change requests, statuses, and merge methods, with merge blocking that binds the plugin and a refused merge while a required status is pending: "Merge blocking that binds the plugin";
  - D8: "Review evidence as a required status";
  - webhooks: "Webhooks verified on the raw body";
  - identifiers: "Opaque SCM identifiers";
  - Forgejo: the mapping in `design.md`.
- Comments: every comment the change adds is at most two lines of at most 80 characters; `npm run verify:comments` passes.
- Honest status: the port is a draft, `0.1.0`. `design.md` states that the Forgejo mapping is an unsourced assumption, lists its unconfirmed conditions, and states that the suite has run only against a test-only fake.
- Evidence check: the change cites only repository documents. The GitHub column of the mapping follows the GitHub qualification record. No external source was consulted.

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

## Final checks

Pending.

## Limitations

- The conformance suite has run only against a test-only in-memory SCM and its defective variants; item 20 runs it against GitHub.com with the plugin's own credential.
- The Forgejo mapping is unverified.
- The reviewer has no network access, so the GitHub and Forgejo facts were reviewed against the repository's records only.

## Remaining gates

- Integration into `dev` and the archive by the coordinator.
- Item 20 runs the suite against GitHub.com; Forgejo's admission confirms the mapping.
