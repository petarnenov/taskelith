## Context

The G0 row's exit evidence is about the repository: reproducible setup, typechecking, boundary checks, a tracked first change, and no reference to another installation. The remaining ledger items need runtime state, a worker image, real integrations, or release preparation, which belong to G2, G3, G6–G7, or G8.

## Goals / Non-Goals

Close G0 honestly: prove the exit evidence from a fresh clone, record the owner's matrix and deferrals, and keep every deferred item visible. Do not claim admission or acceptance, and do not promote to `main`.

## Decisions

- Reproduce the exit evidence from a fresh `git clone` of `dev`, with the pinned toolchain, `npm ci --ignore-scripts`, and `make verify`.
- Record the matrix as an owner decision with native acceptance still required per entry.
- Keep deferred items in the ledger rows with their target gate, rather than removing them.

## Risks / Trade-offs

Deferring native acceptance means each matrix entry is a target, not a supported platform, until its acceptance completes (starting in G2, with rows completing in G3 and G6–G7). The fresh-clone check ran on the author's machine, where Node 24.22.1 with npm 12.2.1 was already installed through nvm.
