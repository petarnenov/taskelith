# Verification: define-sdlc-wire-contracts

## Scope and source

G1 item 13 of the [G1 work plan](/docs/g1-plan.md), assigned by the coordinator session under the owner's 2026-10-24 authorization to start and merge reviewed G1 items, after items 3 and 7. Base revision: `37445fc` on `dev` (the branch was created from `4a3e69e` and fast-forwarded to `37445fc` before its first commit). Scope: the new package `packages/contracts` (documents, validators, tests), `scripts/generate-contracts.ts` and `scripts/check-contract-compatibility.ts` with tests in `test/`, the `contract-compatibility` target and its call in `make verify`, the generation step in the root `build` script, `skipLibCheck` in `tsconfig.check.json`, four root development dependencies and the lockfile, the contract tooling rows of `docs/dependencies.md`, the regenerated inventory and SBOM, five license coverage reviews, and this change. Prepared in a git worktree.

## Environment

macOS (Darwin 25.6.0), Node v24.22.1, npm 12.2.1, Docker 29.6.1. Dependencies installed with `npm install --ignore-scripts` at exact versions.

## Author self-check before review

- Against the ADR 0004 principles: the documents are written first and the types and schema bundles are generated from them in the build, not committed (principle 6, D3 (a)); the contracts live in the private `@taskelith/contracts` package (D2 (b)), which follows the workspace package contract and depends only on `@taskelith/kernel` and `ajv`; the ajv adapter keeps ajv types out of the package API (principles 2 and 3); oasdiff runs only as its digest-pinned image without network (principle 5) through a `make` target that `make verify` calls (principle 7); coverage stays above 75% (principle 9); no code names a specific SDLC framework, harness, provider, or SCM (principle 4).
- Dependency admission: exact pins, register rows updated with lockfile integrity and what was established, inventory and SBOM regenerated, and the five new packages without a top-level license file reviewed with commit-pinned evidence (four `text-located`, `tr46@0.0.3` `declaration-only`). The license evidence was collected by a research subagent of the author's session and spot-checked by the author (`@redocly/openapi-core` gitHead holds `LICENSE.md` and declares 1.34.22). `npm audit` reports two findings, both in the npm bundled by `@semantic-release/npm` and present before this change.
- Evidence check: new external links are the commit-pinned license evidence in `docs/dependencies/license-reviews.json` and upstream links in the register rows, each at a tag or commit.

## Checks

- `make verify` passed at `f05516a`: 207 tests passed, 0 failed; coverage 100% lines, 99.86% branches, 100% functions over the compiled product code (`schema-check.js` 100%); "Workspace and hexagonal boundary checks passed."; "Every product module is in the coverage report."; the compatibility check reported both documents absent at the merge base `37445fc` and passed; "Verified 681 package paths; 19 with license coverage gaps (all reviewed; 4 declaration-only)"; strict OpenSpec validation 31 passed; package verification passed.
- `npm run openspec -- validate define-sdlc-wire-contracts --strict --no-interactive`: valid.
- End-to-end compatibility check, in a scratch clone of `f05516a` with `origin/dev` set to that commit: unchanged documents passed (0 breaking changes each); removing `readAdmission` with `info.version` 0.1.1 failed, naming `api-path-removed-without-deprecation (readAdmission)`; adding a required event metadata field with `info.version` 0.1.0 failed, naming the changed paths; the same changes with `info.version` 0.2.0 passed.
- After the pass-1 fixes, at `b0564f7`: `make verify` passed with 209 tests, 0 failed; coverage 100% lines, 99.86% branches, 100% functions; boundary, coverage scope, compatibility (both documents absent at `37445fc`), inventory (681 package paths, 19 gaps reviewed), strict OpenSpec (31 passed), and package checks passed. In a scratch clone with `origin/dev` at `b0564f7`, changing only the AsyncAPI `info.version` to 0.1.1 passed with 0 breaking changes, and `info.version` 0.2.0-01 failed as not a semantic version.
- After the pass-2 fix, at `693c320`: `make verify` passed with 210 tests, 0 failed; coverage 100% lines, 99.86% branches, 100% functions; all other checks as above (strict OpenSpec 31 passed). In the scratch clone with `origin/dev` at `693c320`, renaming the operation `sendCommand` to `x-parser-user` failed, naming the reserved key.
- `@asyncapi/diff` probes on the AsyncAPI document: identical documents gave no change; an `info.description` edit was non-breaking; a removed message was breaking; an added optional or required payload property was unclassified.

## Independent review

Assigned reviewer (rotation): Codex CLI with `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`, invoked as `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>` from the main session, with the prompt, output, and snapshots kept outside the worktree. The prompt named `AGENTS.md`, the ADR 0004 principles, the governance review process, and the specifications the change touches, and asked for every instance of a problem. SHA-256 snapshots of `git ls-files -co --exclude-standard` were taken before and after each pass.

- **Pass 1** (session `01a16f8a-2e31-7dc3-8c9b-c39ca619dcd0`; the output header reports model `gpt-6.1-sol`, reasoning effort `medium`, sandbox `read-only`). Reviewed `git diff 37445fc` at `f05516a` plus the untracked `verification.md`. Snapshot `4f07add02d3c193fa9201bd650f8ed13475dda38d8e12a27e14dbeb2433b3e2b` before and after. The reviewer ran 13 targeted tests and checked pins, inventory, provenance hashes, license reviews, and SBOM versions against the lockfile; it did not run Docker, fetch, or check external license sources. No findings for Clean Code, SOLID, hexagonal architecture, microkernel, Docker, Makefile operation, or coverage. Findings: 0 Critical, 0 High, 4 Medium, 1 Low, all fixed in `b0564f7`:
  1. Medium: the version pattern accepted any suffix after `-` or `+`, so `0.2.0-`, `0.2.0+`, `0.2.0-01`, or a suffix with a space declared a breaking change. The check now applies the full semantic versioning 2.0.0 grammar, with tests for valid prerelease and build forms and for each malformed one.
  2. Medium: a document absent at the merge base skipped the version check. Its `info.version` is now validated before the comparison is skipped.
  3. Medium: `@asyncapi/diff` classifies the `info.version` edit itself as breaking, so a version-only release needed a minor or major bump. That path is no longer counted; a test covers it, and the scratch clone confirmed a version-only patch passes.
  4. Medium: the annotation filter dropped any change whose path had a segment starting with `x-parser-`, including a user property of that name. Only a segment that is not a key of a schema map (`properties`, `patternProperties`, `definitions`, `$defs`, `dependencies`) counts as an annotation; a regression test changes the type of a property named `x-parser-user-field`.
  5. Low: task 3.1 was unchecked although `make verify` had passed. It is checked.
  The spec and design state the version grammar, the version check for new documents, and the two exclusions.
- **Pass 2** (session `01a16f8d-f398-74f1-ab5e-213d949eb897`; header reports `gpt-6.1-sol`, `medium`, `read-only`). Reviewed `git diff 37445fc` at `b0564f7` plus the uncommitted `verification.md`. Snapshot `49fea880616b2e529462c8b006405ec17ce907644a762eb14f08438b94f92fd3` before and after. The reviewer confirmed pass-1 findings 1, 2, 3, and 5 resolved and finding 4 only partly, and ran 15 targeted tests. Findings: 0 Critical, 0 High, 1 Medium, 0 Low, fixed in `693c320`:
  1. Medium: the annotation filter still dropped changes under document-chosen names outside schema maps, for example an operation named `x-parser-user` whose action changed. The prefix `x-parser-` is now reserved: the check fails for an AsyncAPI document that uses it for any key, at any depth and also for a new document, and only then ignores paths through such keys. Tests cover reserved operation and property names and values that merely contain the prefix; the scratch clone confirmed the failure. The spec adds the requirement "Reserved parser prefix".
- **Pass 3** (session `01a16f91-677f-7c42-822c-57eae0fb4ba7`; header reports `gpt-6.1-sol`, `medium`, `read-only`). Reviewed `git diff 37445fc` at `693c320` plus the uncommitted `verification.md`. Snapshot `88808c1b876ea895ea0e9c27059868bbc2bb0ba5609f605daf954f7f2ec2d917` before and after. The reviewer confirmed every pass-1 and pass-2 finding resolved, ran 16 targeted tests and `git diff --check`, and found no new problem. Findings: 0 Critical, 0 High, 0 Medium, 0 Low.

## Limitations

- Network and telemetry behaviour of the new development tools is not measured; `@scarf/scarf`'s install script does not run because installs use `--ignore-scripts`.
- The compatibility check was exercised on macOS with Docker Desktop; the CI runner is expected to provide Docker but this change did not run CI.

## Remaining gates

- Integration into `dev` by the coordinator, then archiving the change.
