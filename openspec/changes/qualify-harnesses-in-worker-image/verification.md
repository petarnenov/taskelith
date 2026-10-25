## Scope and source

G2 work item 26, `qualify-harnesses-in-worker-image`, assigned by the coordinator on 2026-10-25. The scope: add the pinned Claude Code and Codex packages to the Linux worker image as a digest-pinned image variant, with the default worker image unchanged; run their qualification steps inside it on the architectures D11 selects; update both qualification records. The work qualifies; it does not admit, and both harnesses stay `candidate`. Sources: [docs/g2-plan.md](../../../docs/g2-plan.md) item 26 and D11, [ADR 0007](../../../docs/decisions/0007-g0-closure.md), the two qualification records, and the archived 23a change `2026-10-25-compose-minimal-local-installation-images`.

Decisions taken during the task:

- **Owner, 2026-10-25, relayed by the coordinator:** only credential-free steps run. Every model-calling scenario is recorded as not run, because no login is authorized, and stays open for G3 item 35 (Claude Code) and the G4 admission (Codex).
- **Coordinator, 2026-10-25:** record linux/arm64 as not run, both emulated (the host's QEMU tar fault) and native (D11 runner `ubuntu-24.04-arm`, no workflow added). A native run on an Apple Silicon host follows later as an addendum.
- **Coordinator:** the reviewer is OpenCode, not Claude Fable 5.1, to keep the rotation.

## Revision and environment

- Base: `origin/dev` at `190e2cc`. Branch `qualify-harnesses-in-worker-image`. The variant and steps are in `1dea608`, the records in `8fe91be`; review pass 1 is of `8fe91be`. The pass 1 fixes are in `a439c3e`, `5a3130d`, `b3f274b`, and `fd85386`, together with this record.
- Host: macOS 26.6.2 on x86_64; Docker Desktop with engine 29.5.2 and Compose 5.1.3; Node.js 24.22.1 from `.nvmrc`.

## Author self-check and evidence check

- The pins are the records' own: `@anthropic-ai/claude-agent-sdk@0.3.308` and `@openai/codex@0.164.0`, exact, with no range. The lockfile was generated with `npm install --package-lock-only --ignore-scripts` under Node 24.22.1. Every entry has a registry URL and a `sha512` integrity.
- The lockfile is tied to the qualified artifacts. `npm pack` of `@anthropic-ai/claude-agent-sdk-darwin-x64@0.3.308` and `@openai/codex@0.164.0-darwin-x64` gave tarballs whose `sha512` equals the lockfile integrity. They contain binaries with SHA-256 `9a0bc140…` and `d7e19691…`, the values of the macOS records.
- The SDK's peer dependencies (`@anthropic-ai/sdk`, `@modelcontextprotocol/sdk`, `zod`) are installed and locked, as npm installs peers by default. `npm audit --package-lock-only` reported no vulnerability on 2026-10-25.
- The SDK's binary selection was read from its bundled `sdk.mjs`: on glibc Linux it tries `-linux-<arch>` before `-linux-<arch>-musl`. On linux/amd64 npm installed only the glibc package.
- No credential is in the image. A search of the whole image as root finds no `auth.json` or `.credentials.json`, both harnesses report no login for the qualification home, the build context is a `git archive` of the tracked files, and the steps run with `--network none`.
- Default images: the new stages are appended after `worker`, which is unchanged, and the test asserts that the `worker` stage does not mention the harnesses. `make verify-installation` was run but did not pass (see Checks); the same failure happens on unchanged `dev`.
- The pin test was mutation-checked: changing one integrity character in `docs/qualification/codex.md` made "each qualification record states the locked integrity hashes" fail, and the file was restored.

## Checks

| Check | Result |
| --- | --- |
| `npm run openspec -- validate qualify-harnesses-in-worker-image --strict` | valid |
| `npm run verify:comments` | passed |
| `make verify` at `8fe91be` content, before pass 1 | passed; 1203 tests, 1203 passed, 0 failed; coverage 99.29 % lines, 91.83 % branches, 98.96 % functions; archive dry run valid |
| `make qualify-harnesses OUT=… PLATFORMS=linux/amd64` at `1dea608`, before pass 1 | passed; finished 2026-10-25T21:58:04Z; image `sha256:07a8a3e2…`; superseded by the run at `b3f274b` |
| `make qualify-harnesses OUT=…` at `b3f274b`, after the pass 1 fixes | linux/amd64 passed: every step matched its expected exit status, finished 2026-10-25T22:21:10Z, image `sha256:c890d33d…`, the same binary and schema hashes as before, and the root search found no credential file. linux/arm64 failed in the `node-arm64` build stage with tar's exit status 2, recorded in its `error.txt`, and the target then failed, as designed. These are the results in the records' "Linux worker image" sections |
| `make qualify-harnesses` for both platforms, at the uncommitted first draft | linux/amd64 passed with the same binary hashes. The linux/arm64 build failed in the `node-arm64` stage: under Docker Desktop's QEMU, GNU tar 1.35 failed on every entry with "Cannot mkdir: Invalid argument" or "Cannot open: Invalid argument". A plain `mkdir` in an emulated container of the same base worked |
| `make verify` after the pass 1 fixes, with this record | passed; 1203 tests, 1203 passed, 0 failed; coverage 99.28 % lines, 91.82 % branches, 98.96 % functions; archive dry run valid |
| `make verify-installation` on the branch | failed: `control-plane-1 is unhealthy` at the first start |
| `make verify-installation` on unchanged `dev` (`aba18f5`, main clone) | failed the same way, so the failure is not caused by this change; its cause on this host was not investigated |

## Independent review

Reviewer assigned by the coordinator: OpenCode CLI, `opencode/deepseek-v4.1-flash` with variant `high`, agent `reviewer` (no edits; read-only shell allowlist; web fetch allowed).

### Pass 1

- Session `ses_e8ae7f2c2ffescPZI3hJOo4CzQ`, 2026-10-25 22:04 to 22:14 UTC, on `8fe91be`. The stored messages of the session record model `deepseek-v4.1-flash`, provider `opencode`, and variant `high`.
- Snapshot before and after: `3288804011888042de0b94106c61b13099d4fb796b265aea1103807b3e625219`, equal.
- The reviewer fetched the npm registry entries: every lockfile integrity it checked matched, including the darwin-x64 packages. deps.dev showed no advisory for the two harnesses, `@modelcontextprotocol/sdk@1.32.2`, or a sample of the transitive packages.
- Findings: 0 Critical, 0 High, 8 Medium, 11 Low.

| # | Finding | Resolution |
| --- | --- | --- |
| M1 | Proposal, design, and tasks claimed emulated arm64 evidence that does not exist. | Fixed: all three state that linux/arm64 was not run, and why; task 2.4 records it. |
| M2 | The new requirement demanded a run on every matrix architecture. | Fixed: it now requires a run on each architecture that the host or an authorized runner provides, a result for every architecture, and a gate for each without native evidence. |
| M3 | No `verification.md` or recorded `make verify`. | Fixed: this record. `make verify` had passed before pass 1, and its result is now recorded. |
| M4 | A missing binary path could make a step pass falsely. | Fixed: `qualify.sh` stops if either binary is missing or not executable. Each step has an expected exit status, the schema step counts its files, and the hash pipeline uses `pipefail`. |
| M5 | The script stopped at the first failed platform and recorded nothing for it. | Fixed: each platform runs in a guarded block, a failure writes `error.txt`, the other platforms still run, and the target fails at the end. |
| M6 | `image.txt` named `HEAD` instead of the built tree, and had no input hashes. | Fixed: it records the archived tree, the engine, and the SHA-256 of the Dockerfile, the lockfile, and both scripts. |
| M7 | Codex self-update is not disabled in the image. | Fixed by narrowing the requirement: the variant sets every self-update switch that a harness reads from the environment. Codex reads its switch only from `CODEX_HOME`; the records, the design, and the Codex gates now say so. |
| M8 | The side-effect check did not meet the spec's before-and-after listings. | Fixed: `qualify.sh` lists the qualification home and `/opt/harnesses` before and after, with type, mode, link target, and file hashes. The script stores both listings and their difference, and the records attribute every difference. |
| L9 | The test did not guard `runtime` and `control-plane`. | Fixed: it checks `runtime`, `control-plane`, and `worker`, and that only one stage copies from `harnesses`. |
| L10 | The lock root and `resolved` identity were not checked. | Fixed: the lock root must equal the manifest, and each harness and Linux package must resolve to a tarball of its own version. |
| L11 | A bare `docker build` now builds the variant. | Documented in `docs/local-installation.md`: every build of the Dockerfile names its target, as the scripts do. |
| L12 | `OUT` was not checked to be outside the worktree. | Fixed: the script resolves `OUT` and refuses a path inside the repository. |
| L13 | "Every changed path" overstated the filtered listing, and `grep -v` could abort. | Fixed: the texts name the excluded schema files, and the filter tolerates an empty result. |
| L14 | `qualify.sh` always exited 0. | Fixed: it exits 1 when a step's status differs from the expected one. |
| L15 | The `/tmp` claim about Codex had no scripted evidence. | Fixed: the claim was removed. |
| L16 | "A workflow change is an owner question" was not supported. | Fixed: the texts cite the coordinator's decision that this item adds no workflow. |
| L17 | The register's gate text was inexact. | Fixed: both rows name the remaining Linux gates, the scenarios that need a login and linux/arm64. |
| L18 | Design and proposal overstated the records' integrity coverage, and no `test` commit existed. | Fixed: the design says that the records hold the direct packages' hashes and the lockfile all of them; the test changes are in a `test` commit (`a439c3e`). |
| L19 | "The image holds no credential" was inferred from the login status. | Fixed: a root search of the whole image for credential files supports it, and the login status is stated for the qualification home only. |


## Limitations

- One run per architecture, on linux/amd64 only. Emulated arm64 evidence would not have been support evidence in any case.
- The default images' `node-arm64` stage could not be built under this host's emulation either. This is an observation, not a fix.
- The harness lockfile is outside the root lockfile, so the generated dependency inventory does not cover its packages. The records hold the integrity hashes of the harness packages and their Linux platform packages; the lockfile pins the transitive ones.
- The Codex Linux binary is musl-linked and was only started (version, login status, schema generation) on the glibc base.
- `make verify-installation` does not pass on this host, on this branch or on `dev`.

## Remaining gates

- Native linux/arm64: a run of `make qualify-harnesses OUT=<dir> PLATFORMS=linux/arm64` on an Apple Silicon host, which the coordinator will arrange, or on D11's runner `ubuntu-24.04-arm` if the owner adds a workflow.
- The model-calling scenarios on Linux, with an authorized login: G3 item 35 for Claude Code, and the G4 admission for Codex.
- Coordinator integration, merge into `dev`, and archive.
