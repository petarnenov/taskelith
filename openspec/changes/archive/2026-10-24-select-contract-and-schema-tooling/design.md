## Context

No contract documents or contract tooling exist yet. The G1 plan's items 8 (plugin registration) and 13 (wire contracts) need a validator, generators, linters, and breaking-change checkers chosen through the dependency policy, and open owner decision D3 chooses between document-first and code-first schemas. A research pass gathered npm, osv.dev, and upstream evidence on 2026-10-24.

## Goals / Non-Goals

Goals: compare the tools for both D3 options at exact versions, settle which JSON Schema dialect each document type uses and how shared schemas can work, confirm the OpenSpec JSON output for D6, and register proposed tools as candidates. Non-goals: installing or running any tool on a contract, deciding D2 or D3, writing contract documents, and admitting any dependency.

## Decisions

- Cite every capability claim from upstream documentation at the release tag or commit, and mark runtime claims that were not exercised as unverified.
- Spot-check the research: npm metadata for every proposed package, the AsyncAPI 3.0.0 schema formats table, the OpenAPI 3.1.0 dialect rules, and the oasdiff image index digest on Docker Hub. The check found AsyncAPI 3.1.0 (2026-01-31), which also lists only draft-07, and both are recorded.
- Run the OpenSpec JSON commands in this worktree instead of relying on help text.
- Consume oasdiff only as a digest-pinned container image (ADR 0004 principle 5), not from npm, where its name is a security placeholder.
- Label each recommendation as the author's proposal, and register every proposed tool as `candidate`, never `accepted`.

## Risks / Trade-offs

Package versions move quickly, so the evaluation ages; exact pins and dates make that visible. Several tools carry npm malware or advisory history, which the register records as admission evidence rather than hiding. Nothing was run on a real contract, so integration problems surface only in items 8 and 13.
