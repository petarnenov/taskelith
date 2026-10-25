## Context

Three read-only reviews compared the proof of concept with `dev` at `69e5bd2`: the SDLC domain and plugins (`packages/modules/sdlc`, `packages/plugins/*`, `packages/plugin-sdk`), execution, scheduling, and workers (`packages/modules/execution`, `packages/modules/scheduling`, `docs/contracts/*`), and the control plane, contracts, and persistence (`packages/contracts/documents`, `packages/adapters/postgres`, `docs/trust-model.md`). Most product APIs, sessions, and the live transport do not exist yet; they are G2 item 16 and G3 items 4, 9, 10, 13, and 14.

## Goals / Non-Goals

Goals: the proof of concept uses the backend's identifiers, states, and rules wherever the backend has them, marks what later gates add, and the specification no longer contradicts the contracts. Non-goals: build any product code or API, decide open questions such as the role that reconciles, or change any contract.

## Decisions

- **Data from the backend's own definitions.** The stage graphs are copied from the OpenSpec plugin's `stagesOf` and the SpecKit mapping fixture and shown in a linear order, although the graphs only fix dependencies (in OpenSpec, `design` depends on `proposal`, not on `specs`). The gates per stage are illustrative: the backend names evidence kinds and gate states, but a run's gates are configured, not part of the stage graph. Evidence kinds, gate states, admission kinds, waiting reasons, pressure causes, outcomes, and roles use the backend's names. Sample values (digests, IDs, counts) stay illustrative.
- **Column placement is a UI rule.** The backend has no columns. A stage's column follows its first lifecycle obligation, except that SpecKit's platform-managed `review-spec` and `review-plan` stay in Specify, because they review planning artifacts. The data names the column per stage so that the rule is visible.
- **Derived session status.** `deriveSessionStatus` turns execution facts into the badge, following architecture invariant 6, instead of a stored session enum.
- **Personas instead of a real login.** The account menu switches between three personas so that a reviewer can see each role's view; a disabled action names the role it needs. Reconciliation is given to `project-maintainer` and recorded as open, because the trust model names no role.
- **Visible later gates.** Features that the backend does not have yet stay in the proof of concept as the target design, each with a marker naming its gate or plan item, so that nothing implies it exists.
- **Specification.** Only the scenario that contradicts a contract changes; the other `product-ui` requirements are not touched. Because the pinned OpenSpec cannot drop a scenario through MODIFIED, nor remove and add one name in one delta, the requirement is removed and added as "Session activity indicator" with the other scenarios copied unchanged; the G3 plan's starting point uses the new name.

## Risks / Trade-offs

The proof of concept now carries more backend detail than a final UI would show; item 28 decides what to keep visible. The stacked branch must merge after `record-mantine-ui-poc`.
