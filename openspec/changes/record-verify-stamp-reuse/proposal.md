## Why

The owner decided on 2026-10-28 that every integration records whether `make verify` ran or a verified-tree stamp was reused, so that the time the stamp saves can be measured and the integration pull request carries the evidence. Today `make integrate` only prints that it reuses a stamp and keeps no record.

## What Changes

- `make integrate` (`scripts/integrate.sh`) prints one integration line after its verify step: the merged tree hash; `ran`, or `reused stamp of <time>` with the stamp's verification time; the profile; the whole seconds of the verify step, near 0 on reuse; the archived change; the branch; and the run's start time.
- It adds the same line after the coordinator's `BODY` to the body of the integration pull request that it opens, or appends it to the body of an open pull request that a resume continues, before the merge.
- It appends the line as one JSON object to `${XDG_STATE_HOME:-~/.local/state}/taskelith/integrations.jsonl`, next to its verify logs; a failed append only warns and never fails the integration.
- `docs/agent-task-protocol.md` names the line and the log in the coordinator's integration step.

Out of scope: when a stamp is reused, the `pre-push` hook, and any report over the log (a follow-up).

## Capabilities

### New Capabilities

### Modified Capabilities

- `integration-flow`: a new requirement for the integration verify record.

## Impact

Repository tooling only: `scripts/integrate.sh`, `test/integrate-script.test.ts`, and `docs/agent-task-protocol.md`. No product code and no published package change.
