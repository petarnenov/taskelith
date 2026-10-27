# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

The owner's G2 plan, item 2 (`spike-jetstream-transport`), assigned on 2026-10-25 by the session coordinating G2 (Niki): a test-only spike against the pinned NATS container of item 9, with the exact-pinned `@nats-io` 3.4.0 clients approved by the owner, no product code, and the measurements recorded in a document. For the per-worker permission test the author offered three options (static configuration, adding `@nats-io/jwt` and `@nats-io/nkeys`, or pre-generated fixtures); the coordinator chose the static configuration (option A), which adds no package and needs no owner decision. Base revision: `2545d26` on `dev`, merged with `origin/dev` at `9fb1c00` after item 9 merged. Scope: `apps/control-plane/test/jetstream-spike.integration.test.ts` and `jetstream-spike-fixture.ts`, `apps/control-plane/package.json`, `package-lock.json`, the regenerated `docs/dependencies/licenses.json` and `sbom.cdx.json`, `infra/services/nats-server.conf`, the new `docs/g2-jetstream-spike.md`, the NATS rows and section paragraph of `docs/dependencies.md`, and this change with the new `jetstream-transport-spike` capability.

## Environment

macOS (Darwin 25.6.0, x86_64), Node v24.22.1 through `nvm use`, npm 12.2.1, Docker Engine 29.5.2 (`linux/amd64`), nats-server 2.15.1 from `nats:2.15.1-alpine@sha256:7ae34c25dfd6fe2e01c6483eabef20d796690fdcac6c4d94ca780a6cf9877fde`.

## Evidence

- Before item 9 merged, the author ran exploratory probes and the draft tests from a scratch directory against the item 9 Compose file under a separate Compose project, and against the same image with the draft configuration; nothing in the repository changed. The draft suite passed twice in a row.
- After the merge, the suite runs inside `make verify` against the per-run services of item 9; its diagnostics report server 2.15.1, JetStream API level 5, `max_payload` 1048576, Node v24.22.1, redelivery 1001–1004 ms and 2004–2006 ms after the first delivery with `ack_wait` 1000 ms, redelivery 702–704 ms after `nak(700)`, and expiry 1251–1301 ms after publication with `max_age` 1000 ms, across all runs after the pass-1 fixes. After the pass-1 and pass-2 fixes the spike passed three runs in a row against `make services-up` and inside `make verify`.
- `tsc -p tsconfig.check.json` type-checks the spike against the installed client declarations without errors, which supports the record's statement about the `types` field.

## Author self-check before review

- Every behavior the record states as measured is asserted by a test in the spike file; what was not exercised is listed under "Not measured" with the owning item.
- No product code: the change adds test files, a fixture, development dependencies, test service configuration, and documentation; the published package's file allowlist is unchanged.
- The shared NATS configuration keeps clients without credentials working through `no_auth_user`; item 9's services test still passes.
- Comments are within the comment length rule; spec requirements are under 500 characters (358, 255, 328, and 174); the new capability starts with `## Purpose`.
- Commit types are `docs:`, `test:`, and `build:` only.

## Checks

In the worktree, Node v24.22.1, npm 12.2.1: `npm run openspec -- validate spike-jetstream-transport --strict` passed; `make dependency-inventory` generated 701 package paths, 21 with reviewed license coverage gaps; `make verify` passed (323 tests passed, 0 failed; coverage 99.63% lines, 95.74% branches, 99.28% functions; strict OpenSpec validation 39 passed; archive dry run, dependency inventory check, and package verification passed). After the pass-1, pass-2, and pass-3 fixes, `make verify` passed each time with 326 tests and the same coverage and validation results.

## Independent review

Assigned reviewer: Codex CLI, `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, run from the worktree without network access. SHA-256 snapshots of `git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256` are taken before and after each pass; prompts, outputs, and snapshots are kept outside the worktree.

- **Pass 1 — session `01a17075-97c6-7582-a5ac-c8c102d94222`**, at `d6c131a`. The output header reports model `gpt-6.1-sol`, reasoning effort medium, and sandbox read-only. Snapshot before and after: `9cbb42e30f0f0a12ce4af42cb0f78b2c50d64d010c2b8447f1504173288f2c7b`, unchanged. The reviewer also checked the six added package paths against the lockfile, license inventory, and SBOM (no mismatch). Findings: 0 Critical, 0 High, 4 Medium, 3 Low. All accepted and fixed:
  1. Medium: redelivery intervals were measured from the next pull, not from the first delivery or the negative acknowledgement. Deliveries now record their receipt time, and intervals are taken from the first delivery and from the `nak`.
  2. Medium: the redelivery test stopped at the first redelivery, so it neither excluded a redelivery of the acknowledged command nor asserted the third delivery the record stated. It now asserts both first deliveries and collects every redelivery for 2.6 s.
  3. Medium: the redrive used the original command, not the quarantine record. The test now writes the record with diagnostic headers, reads it back, checks it, and redrives from it.
  4. Medium: one test mixed `discard: old` with a one-second `max_age` and a fixed sleep. They are now separate tests; expiry is polled with a bounded timeout and reported as a diagnostic.
  5. Low: `ack()` and the pull-expiry floor were stated without a test. Both are now asserted.
  6. Low: the loss of advisories without a subscriber was stated without a test. A termination before the capture stream exists is now asserted as not recorded.
  7. Low: the compatibility wording overstated item 1's evidence. It now says the pinned sources neither state support nor show a CI result.
- **Pass 2 — session `01a1707c-1ac0-7cb0-8b2f-fdfdc6681073`**, at `3547119`. The output header reports model `gpt-6.1-sol`, reasoning effort medium, and sandbox read-only. Snapshot before and after: `bc693fe89c54978eee26edfa999dd2716fdf8de8cc16b1cda478a627a0161a29`, unchanged. The reviewer confirmed pass-1 findings 1–5 and 7 as resolved and finding 6 as partly resolved. Findings: 0 Critical, 0 High, 3 Medium, 1 Low. All accepted and fixed:
  1. Medium: the redelivery test expected exactly two redeliveries inside a fixed window that started late. It now takes exactly two redeliveries from one pull bounded at 5 s, acknowledges the third delivery, and asserts that a further 1.5 s pull receives nothing.
  2. Medium: `flush()` stood in for the server's processing of `ack()` and `term()`. The plain acknowledgement now polls the consumer state, and the uncaptured termination waits for its advisory before the capture stream is created, which also completes pass-1 finding 6.
  3. Medium: a fixed 100 ms sleep stood in for the store of a publication through another connection, and for the arrival of subscription errors. Both are now bounded polls; the store is checked by its payload.
  4. Low: the record said the quarantine record kept the original headers and the advisory type without asserting the type. It now names the three diagnostic headers, and the test asserts all of them.
- **Pass 3 — session `01a17082-d206-7e91-b182-6ca3d231651d`**, at `be383aa`, the last pass the process allows. The output header reports model `gpt-6.1-sol`, reasoning effort medium, and sandbox read-only. Snapshot before and after: `64d20b66daa817d2551d285c79ed76d7caf28dda7a5f30f955da25ba63998f05`, unchanged. The reviewer confirmed all four pass-2 findings and pass-1 finding 6 as resolved. Findings: 0 Critical, 0 High, 0 Medium, 4 Low. All accepted and fixed:
  1. Low: the plain acknowledgement row still said "and a flush". It now says the consumer state is polled.
  2. Low: the record stated JetStream API level 5, but the test only reported it. The test now asserts it.
  3. Low: some behaviors listed as not measured named no owning item. Each entry now names its item or gate; TLS is recorded as named by no G2 item.
  4. Low: the reproduction instruction bypassed the Makefile (ADR 0004 principle 7). It now names `make test` and `make verify` only.

By the [review process](/docs/governance.md#independent-review-process), a pass with only Low findings is fixed without another review; the pass-3 fixes are **unreviewed**. After them, `make verify` passed again (see Checks).

## Limitations

Measured on one host (macOS x86_64 with Docker `linux/amd64`) against a single server with small limits and one-second timings; the record lists what was not measured.

## Remaining gates

Integration by the coordinating session (pull request into `dev`, merge); archival. Item 13 measures decentralized authentication under D9 (a).
