# Verification: implement-operator-login-and-roles

Status: design stage; no production code, checks, or review yet.

## Scope and source

- G3 item 10 ([G3 work plan](/docs/g3-plan.md), row 10, decision D2 (a)), size M-L, commit type `chore`, assigned by the coordinator on 2026-10-28 and developed in a briefed subagent from `dev` `a3a0ac4c`.
- Sources and exclusions: [design](design.md) "Context" and "Sources".

## Revision

- Base: `dev` `a3a0ac4c`.

## Environment

To be recorded with the first `make verify` run.

## Author self-check

To be recorded after the implementation.

## Checks

To be recorded.

## Limitations

- The evidence retirement entry is deferred until its 9b to 9d operation lands in `dev` ([design](design.md) "Non-goals").

## Independent review

Not started.

## Remaining gates

- The temporary G2 bridge, under which an `installation-owner` passes the project requirements of the G2 operator operations, is retired by item 11 ([design](design.md) decision 6, Q5).
- Follow-up contract change `add-account-self-service-operations`, planned by the coordinator before item 28: account self-service HTTP operations, the browser first run, and the caller's project roles (Q1, Q2, Q12).
- Change 10b: the evidence retirement entry once its 9b to 9d operation is in `dev` (Q13).
- Implementation, `make verify`, and review passes.
- Integration into dev by the coordinator (single pull request)
