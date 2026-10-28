# Verification: wire-git-workspace-into-worker

## Scope and source

G3 item 16 (`docs/g3-plan.md`, row 16), sub-change 16e, developed by a briefed subagent for the coordinator Niki: the worker wiring and admission of the Git workspace adapter, namely the execution group, the single slot and its start refusal, `fs.protected_hardlinks`, `reclaim-failed` handling, and the macOS composition.

## Revision

- Base: `dev` `f68d4f76`.
- To be recorded.

## Environment

To be recorded.

## Coordinator decisions

Pending: questions Q1 to Q10 of `design.md`.

## Fail-before

To be recorded.

## After the change

To be recorded.

## Checks

To be recorded.

## Contract amendments

To be recorded.

## Limitations

To be recorded.

## Remaining gates

- The suite natively on macOS against the Git adapter with Apple's `/usr/bin/git` 2.50.1 on the iMac (contract section 13, pending gate), arranged by the coordinator.
- `make verify-worker-image-reproducible`, arranged by the coordinator.
- Item 38: the delegated-child half of "One handed-off workspace".
