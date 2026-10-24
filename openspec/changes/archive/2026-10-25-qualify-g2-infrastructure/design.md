## Context

The owner decided D1, D2, D4, D6, and D8 of the G2 plan on 2026-10-25. Item 1 records the evidence the dependency policy requires before items 2, 5, 9, 10, 11, 12, and 14 install or run these components. G1 item 3 (`select-contract-and-schema-tooling`) set the pattern: an evaluation document with pinned sources and an "unverified" marker, and a register section that lists each proposed tool as `candidate`.

## Goals / Non-Goals

**Goals:**
- Exact versions, multi-arch image digests, licenses, security routes, advisories, and maintenance evidence for every component the decisions name or leave open.
- A labeled proposal wherever a decision leaves a choice: the image variants, the PostgreSQL driver, the migration tool, and the NATS client.

**Non-Goals:**
- Installing anything, or writing Compose files, `make` targets, or code (item 9 and later).
- Reopening D1, D2, D4, D6, or D8, or admitting any component as `accepted`.

## Decisions

- **New document and capability.** `docs/g2-infrastructure.md` holds the evaluation and the new `infrastructure-tooling` capability states its requirements, as `contract-tooling` does for G1 item 3. A spec delta, not `skip_specs`, because no existing requirement covers G2 infrastructure evidence.
- **Pins.** Images are pinned by multi-arch index digest with both platform digests listed, because tag digests move on rebuilds (observed for `postgres` on 2026-10-21). npm packages are named at exact versions with their tag commits.
- **Proposals (the author's).** `postgres:18.6-trixie` (upstream default variant); `nats:2.15.1-alpine` (same binary as scratch, with a shell for health checks); the official modular nats.js 3.4.0 packages (the legacy package is deprecated); `pg@8.23.1`; `node-pg-migrate@9.0.0` over dbmate, because it runs in-process on the same driver and locks by default, while dbmate adds an image and locks only on request; Toxiproxy controlled through `fetch`, without a client package.
- **Evidence gathering.** Research passes collected registry, image, and advisory facts; the author re-inspected every proposed image digest and npm version, the `node:sqlite` stability line and bundled SQLite version, and the status of every external link.

## Risks / Trade-offs

- nats.js 3.4.0 has no stated support for nats-server 2.15 and no Node 24 CI → item 2's spike must establish it before item 12.
- `node-pg-migrate` has no checksum of applied files → item 11 closes or records the gap.
- `node:sqlite` is a release candidate → D4 keeps `better-sqlite3` as the fallback, and item 14's durability tests decide.
- Upstream facts change after 2026-10-25 → every fact carries its observation date; item 9 rechecks digests before pinning them.
