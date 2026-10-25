## Context

The make targets and their tests had run only on macOS. The coordinator asked for one observation on a Linux host, recorded as docs, with failures reported rather than fixed.

## Goals / Non-Goals

Record the host, the results, the timing, and each failure with its output and cause. Do not change product code, scripts, tests, or the host setup, and do not claim native acceptance under the worker platform contract.

## Decisions

- A new `docs/linux-verify-observation.md` holds the record, because `docs/foundation.md` is a readiness ledger of short entries; the ledger links to it.
- The runs use a fresh worktree of `origin/dev` at `61e81f4`, so the observation covers the integrated `dev` and not local state.
- When `make setup` failed because of the host's `PATH`, the runs continued with nvm's pinned Node.js first in `PATH` for these commands only. The record shows both the failure and the workaround, and the host's own setup stays unchanged.
- `make verify-linux-cgroup` ran four times, as in the supervisor change, to show whether it is stable on this host.

## Risks / Trade-offs

One host and one revision. The record says what was not observed, so that readers do not take it as wider evidence.
