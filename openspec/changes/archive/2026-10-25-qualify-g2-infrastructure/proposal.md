## Why

The G2 work plan (`docs/g2-plan.md`, item 1, `qualify-g2-infrastructure`) requires established open-source dependencies for G2 (ADR 0004, R35) and evidence for the owner's decisions D1, D2, D4, D6, and D8, all decided on 2026-10-25. Items 2, 5, 9, 10, 11, 12, and 14 install or run these components; the dependency policy requires their exact versions, digests, licenses, security routes, and maintenance evidence to be recorded first.

## What Changes

- Add `docs/g2-infrastructure.md`: a pinned, source-cited evaluation, for the decided options, of the PostgreSQL server and its official image (D1), the NATS server and its official image (D2), the NATS JavaScript client, the SQLite bindings (`node:sqlite`, with `better-sqlite3` as the fallback, D4), the PostgreSQL driver and the versioned SQL migration tool (D6), and the partition proxy (D8), with versions, multi-arch image digests, licenses, security reporting routes, advisories, and maintenance evidence; proposals are labeled as the author's.
- In `docs/dependencies.md`, add a "G2 infrastructure" section that gives PostgreSQL and NATS JetStream their exact versions, digests, and evidence and registers each new tool as `candidate`, and update the "Planned components" paragraph.
- Add the `infrastructure-tooling` capability.

## Capabilities

### New Capabilities
- `infrastructure-tooling`: a pinned, source-cited evaluation of the G2 infrastructure services, clients, and test tools, with each one registered as a candidate before it is installed.

### Modified Capabilities

None.

## Impact

Documentation only. No dependency or image is installed or added to `package.json`, a lockfile, Compose, or the Makefile; installation happens in item 9. No code, CI, or package impact. The owner's decisions D1, D2, D4, D6, and D8 stand; the evaluation chooses only among tools those decisions leave open (the image variants, the driver, the migration tool, and the client), as the author's proposal.
