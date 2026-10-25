# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

The owner's G2 plan, item 2 (`spike-jetstream-transport`), assigned on 2026-10-25 by the session coordinating G2 (Niki): a test-only spike against the pinned NATS container of item 9, with the exact-pinned `@nats-io` 3.4.0 clients approved by the owner, no product code, and the measurements recorded in a document. For the per-worker permission test the author offered three options (static configuration, adding `@nats-io/jwt` and `@nats-io/nkeys`, or pre-generated fixtures); the coordinator chose the static configuration (option A), which adds no package and needs no owner decision. Base revision: `2545d26` on `dev`, merged with `origin/dev` at `9fb1c00` after item 9 merged. Scope: `apps/control-plane/test/jetstream-spike.integration.test.ts` and `jetstream-spike-fixture.ts`, `apps/control-plane/package.json`, `package-lock.json`, the regenerated `docs/dependencies/licenses.json` and `sbom.cdx.json`, `infra/services/nats-server.conf`, the new `docs/g2-jetstream-spike.md`, the NATS rows and section paragraph of `docs/dependencies.md`, and this change with the new `jetstream-transport-spike` capability.

## Environment

macOS (Darwin 25.6.0, x86_64), Node v24.22.1 through `nvm use`, npm 12.2.1, Docker Engine 29.5.2 (`linux/amd64`), nats-server 2.15.1 from `nats:2.15.1-alpine@sha256:7ae34c25dfd6fe2e01c6483eabef20d796690fdcac6c4d94ca780a6cf9877fde`.

## Evidence

- Before item 9 merged, the author ran exploratory probes and the draft tests from a scratch directory against the item 9 Compose file under a separate Compose project, and against the same image with the draft configuration; nothing in the repository changed. The draft suite passed twice in a row.
- After the merge, the suite runs inside `make verify` against the per-run services of item 9; its diagnostics report server 2.15.1, JetStream API level 5, `max_payload` 1048576, Node v24.22.1, redelivery after 1000 ms with `ack_wait` 1000 ms, and redelivery 702 ms after `nak(700)`.
- `tsc -p tsconfig.check.json` type-checks the spike against the installed client declarations without errors, which supports the record's statement about the `types` field.

## Author self-check before review

- Every behavior the record states as measured is asserted by a test in the spike file; what was not exercised is listed under "Not measured" with the owning item.
- No product code: the change adds test files, a fixture, development dependencies, test service configuration, and documentation; the published package's file allowlist is unchanged.
- The shared NATS configuration keeps clients without credentials working through `no_auth_user`; item 9's services test still passes.
- Comments are within the comment length rule; spec requirements are under 500 characters (358, 255, 328, and 174); the new capability starts with `## Purpose`.
- Commit types are `docs:`, `test:`, and `build:` only.

## Checks

In the worktree, Node v24.22.1, npm 12.2.1: `npm run openspec -- validate spike-jetstream-transport --strict` passed; `make dependency-inventory` generated 701 package paths, 21 with reviewed license coverage gaps; `make verify` passed (323 tests passed, 0 failed; coverage 99.63% lines, 95.74% branches, 99.28% functions; strict OpenSpec validation 39 passed; archive dry run, dependency inventory check, and package verification passed).

## Independent review

Assigned reviewer: Codex CLI, `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, run from the worktree without network access. SHA-256 snapshots of `git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256` are taken before and after each pass; prompts, outputs, and snapshots are kept outside the worktree.

Pending.

## Limitations

Measured on one host (macOS x86_64 with Docker `linux/amd64`) against a single server with small limits and one-second timings; the record lists what was not measured.

## Remaining gates

Independent review; integration by the coordinating session (pull request into `dev`, merge); archival. Item 13 measures decentralized authentication under D9 (a).
