# Verification: align-harness-identifiers

## Scope and source

- Brief from coordinator Niki on 2026-10-26: align the harness plugin identifier and the subscription mechanism wording of the account pool contract (`define-account-pool-contract`) and the agent harness port contract (`define-agent-harness-port`), the follow-up that the archived pool design names under the risk "Two plugin identifiers".
- Decision A1 + B1: made by an OpenCode delegate (`kimi-k2.7-code`) on the owner's delegation while the owner was away, run `/Users/petarnenov/.config/away/runs/20261026T095621Z-opencode-45167`, relayed by coordinator Niki (design, "Decisions").
- Delivered: `HarnessPluginId` in Execution's identifiers, exported from `@taskelith/execution`; Scheduling imports it and no longer declares or re-exports its own; account pool contract sections 1, 2, and 3.1 and agent harness port contract sections 3 and 4.1 aligned; the `account-pool-port` spec delta adding the requirement "Shared harness plugin identifier".
- Not delivered, by scope: new validation, behavior, adapters, selection or scheduler code; changes to ADR 0005; typing a slot's mechanism with Execution's `SubscriptionMechanism`.
- Open question recorded for the coordinator: how the add-slot command reads a plugin's declared mechanisms (design, "Open questions for the coordinator").

## Revision

- Branch `align-harness-identifiers`, created from `origin/dev` at `f27d414`. Checked revision: `876fa60`, plus this record.

## Environment

- Linux 6.8.0-147-generic (Ubuntu), x86_64; Node.js v24.22.1 from `.nvmrc` through `nvm use`, npm 11.19.1.
- Worktree `../taskelith-worktrees/align-harness-identifiers`, developed by an implementation subagent that the coordinator briefed.

## Author self-check

- One type names a harness plugin: `grep` finds `Identifier<'HarnessPluginId'>` only in `packages/modules/execution/src/domain/identifiers.ts`.
- Scheduling imports `HarnessPluginId` from `@taskelith/execution` in `account-slot.ts`, `slot-selection.ts`, `account-pool.ts`, `account-pool-conformance.ts`, and its test; `@taskelith/scheduling` re-exports none of Execution's identifiers, as before for `WorkerId`.
- `SubscriptionMechanismId` stays Scheduling's own brand; no Scheduling file imports `SubscriptionMechanism` or `SUBSCRIPTION_MECHANISMS`.
- No contract states a new check. The harness port contract states only its existing rule: a start or resume request whose credential names an undeclared mechanism fails with `invalid`. The pool contract's existing add-slot check (section 3.1) is kept, with "manifest" replaced by the harness port's `capabilities`.
- ADR 0005 and `openspec/specs/*` are unchanged.
- The type change adds no runtime code, so no new runtime test protects it; the Scheduling test and conformance suite compile against Execution's export, which `make verify` builds and type-checks.

## Evidence check

- The archived pool design's risk "Two plugin identifiers" and its verification (pass 1 finding M4, the source of the section 3.1 add-slot check) were read at the base revision.
- The `harness-account-pools` scenario "Non-subscription credential" was read; it is the existing requirement to reject an undeclared mechanism when a slot is configured.
- `PluginManifest` in `packages/plugin-sdk/src/plugin-manifest.ts` has the `id` field that the contracts name as the value of `HarnessPluginId`.
- The relative links added to both contracts (`agent-harness-port.md`, `account-pool.md`) resolve to existing files.

## Checks

| Revision | Command | Result |
| --- | --- | --- |
| `709261d` | `make verify` | Failed in the archive dry run: the first delta, a `MODIFIED` "Harness-neutral slot records", exceeded 500 characters. Replaced by an added requirement (design decision 5) |
| `876fa60` | `npm run openspec -- validate align-harness-identifiers --strict` | `Change 'align-harness-identifiers' is valid` |
| `876fa60` | `make verify` | Passed: 1532 tests, 1517 passed, 0 failed, 15 skipped; coverage over all files 99.12% lines, 91.75% branches, 98.56% functions; 67 OpenSpec items valid; boundary checks, comment check, archive dry run, and package verification passed |
| Head with this record | `npm run openspec -- validate align-harness-identifiers --strict`; `make verify` | Repeated after this record was added; results reported to the coordinator in the handoff |

## Review

- Pending: OpenCode (`opencode-go/kimi-k3.1-pro`, high effort), assigned by the coordinator.

## Limitations

- The add-slot mechanism check of the pool contract section 3.1 has no defined source of the plugin's declaration outside a session (open question).
- No adapter or runtime code uses `HarnessPluginId` yet; items 12 and 18 will.

## Remaining gates

- Independent review by the assigned reviewer, recorded here.
- Coordinator integration: merge `origin/dev`, pull request into `dev`.
- Archive after integration.
