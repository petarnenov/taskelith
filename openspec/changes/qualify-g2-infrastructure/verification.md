# Verification

Date: 2026-10-25. Author verification and independent review are recorded below.

## Scope and source

The owner's G2 plan, item 1 (`qualify-g2-infrastructure`), assigned on 2026-10-25 by the session coordinating G2 (Niki): documentation only; no installs, no `package.json`, lockfile, Compose, or Makefile changes; installation is item 9. Base revision: `2d3b175` on `dev`. Scope: the new `docs/g2-infrastructure.md`, the new "G2 infrastructure" section of `docs/dependencies.md` with its scope line and "Planned components" paragraph, and this change, including the new `infrastructure-tooling` capability.

## Environment

macOS (Darwin 25.6.0, x86_64), Node v24.22.1 through `nvm use`, npm 12.2.1, Docker 29.6.1 with buildx for image inspection.

## Evidence

- Three research passes on 2026-10-25 gathered npm registry, Docker Hub and ghcr.io index, osv.dev, GitHub advisory and repository-setting (`private-vulnerability-reporting`), and upstream documentation evidence; nothing was installed into the repository. Package tarballs were downloaded to a scratch directory only to list their files.
- `node:sqlite` was exercised under Node 24.22.1 outside the repository: module load without a warning, `process.versions.sqlite` and `select sqlite_version()` (3.53.4), `PRAGMA journal_mode=WAL`, `PRAGMA synchronous=FULL` read back as 2, and `typeof sqlite.backup`.
- Author spot-checks the same day: `docker buildx imagetools inspect` of `postgres:18.6-trixie`, `nats:2.15.1-alpine`, `nats:2.15.1-scratch`, `nats:2.15.1`, `ghcr.io/shopify/toxiproxy:2.13.0`, and `ghcr.io/amacneil/dbmate:2.37.0`, comparing the index and `linux/amd64` and `linux/arm64` digests with the document; npm `latest` version, license, and engine of `pg`, `@types/pg`, `node-pg-migrate`, the three `@nats-io` packages, and `better-sqlite3`; the `node-pg-migrate` 9.0.0 peer range; the `sqlite.md` stability line and the `sqlite3.h` version at tag `v24.22.1`; the PostgreSQL 18.6 migration notes.

## Author self-check before review

- Decisions D1, D2, D4, D6, and D8 are recorded as decided and not reopened; every choice they leave open is labeled as the author's proposal.
- Every runtime claim not exercised is marked **(unverified)**, by section or inline; adoption is labeled verified only where an adopter's `package.json` was read at a pinned commit.
- Every proposed image is named by tag, index digest, and both platform digests; every proposed component has a `candidate` row in the register with version or digest, license, runtime, upstream, and remaining evidence.
- Evidence check: every external link in `docs/g2-infrastructure.md` returned HTTP 200 (one transient 503 for the Toxiproxy README rechecked as 200); links are pinned to a tag, commit, or exact version, or the service is labeled unversioned.
- Spec requirements are under 500 characters (408, 350, and 269); the new capability's delta starts with `## Purpose`.
- No file outside the paths in Scope changed.

## Checks

In the worktree, Node v24.22.1, npm 12.2.1: `npm run openspec -- validate qualify-g2-infrastructure --strict` passed; `make verify` passed (276 tests passed, 0 failed; coverage 99.63% lines, 95.68% branches, 99.27% functions; strict OpenSpec validation 34 passed; archive dry run, dependency inventory, and package verification passed).

## Independent review

Assigned reviewer: Claude Code with `claude -p <prompt> --model claude-fable-5-1 --effort medium --permission-mode plan --disallowedTools Edit Write NotebookEdit --output-format json`, run from the worktree; it has network access, which this item needs to check upstream facts. SHA-256 snapshots of `git ls-files -co --exclude-standard | xargs shasum -a 256 | shasum -a 256` were taken before and after each pass; prompts, outputs, and snapshots are kept outside the worktree.

## Limitations

Upstream facts are observations of 2026-10-25; tag digests move on rebuilds. No image was pulled or run, no package was installed into the repository, and no image contents were scanned.

## Remaining gates

Integration by the coordinating session (pull request into `dev`, merge); archival; installation and qualification of the components in G2 items 2, 5, 9, 10, 11, 12, and 14.
