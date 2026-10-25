# ADR 0014: The decision council and delegated approval authority

Date: 2026-10-25
Status: Decided by the owner on 2026-10-25 in the project conversation. Recorded; no council, decision record, or communication plugin exists yet. Implementation is not authorized: it starts only on an explicit owner authorization, and not before Claude Code, Codex, and OpenCode are admitted.

## Context

- The owner wants full autonomy up to the project's integration branch: the machine plans, implements, verifies, reviews, and merges without a person. A person is involved for escalation and for promotion into `main`.
- Existing rules bound the design: the owner or an explicitly authorized integrator controls merging ([governance](../governance.md#authority)); an enabled auto-merge setting is that authority ([ADR 0008](0008-product-ui-and-integration-authority.md) decision 2); an agent cannot authorize its own integration; verification is evidence, not a vote; independent review is a separate session and never falls back to the implementer.
- The owner decided that three consuls, each a different harness, decide by majority; ties follow a fixed precedence; a human is called only when the council cannot convene.
- The owner separately decided that the approval of an intent is a standing approval for its generated work, recorded per change, rather than a vote per change, so autonomy stays affordable. That mode is decision 6; it is distinct from ADR 0013 decision 8, which makes a parent's approval the specification approval of its generated work.
- The three harnesses do not arrive together: Claude Code is the G3 harness, Codex the G4 harness, and OpenCode after them ([ADR 0003](0003-first-integrations-and-plugin-kernel.md)). The council therefore cannot be constituted as designed until all three are admitted.

## Decisions

1. **Three seats, three harnesses.** The council has exactly three seats, each bound to a different harness plugin with its own model and effort, set at appointment. The owner appoints and rotates the seats. A seat records its harness, model, effort, precedence rank, and account slot pool.
2. **Deliberation and vote.** The council discusses a question for at most three cycles, then votes. A 2:1 majority decides. If there is no majority (1:1:1), the configured precedence ranks decide. The owner-approved default order is Claude, then Codex, then OpenCode, and the ranks are set at appointment. Under that default a 1:1:1 split is decided by Claude, while Codex and OpenCode decide only together. A decision requires all three seats. A partial bench does not vote and does not substitute a harness, because either would break the three-harness rule or the majority rule. The behavior when one or two seats are unavailable is an open owner decision; until it is decided, a question that cannot convene all three seats escalates to a human through the communication plugin and in the board. A replacement seat is possible only when the owner appoints a fourth distinct harness in a separate decision.
3. **Authority.** The council approves an intent proposal, which covers its generated campaigns and changes; the specification of a standalone task; the ratification of verification and independent-review outcomes; and the merge of a change or an intent into an integration branch, either by a decision on that merge or through the standing approval that decision 6 defines. It ratifies outcomes by a decision or by the standing rule, never by waiving evidence. It resolves disputes and handles escalations not reserved to the owner. It cannot waive verification evidence, approve a change it implemented or reviewed, change policy or project settings, release an operator hold, merge into `main`, or release or deploy.
4. **Independence.** A consul that implemented or reviewed a change does not vote on that change. The decision record names each voter, and the implementer and reviewer identities are excluded from the eligible voters of that decision.
5. **Decision records.** Every decision is an immutable, audited record binding the subject, the exact artifact, code, and policy revisions, the options, each consul's vote and dissent, the discussion cycles, the outcome, the escalation when there is one, and the policy revision. A decision is evidence for a gate; it is not a substitute for the gate's own evidence.
6. **Standing approval instead of a vote per change.** The approval of an intent is a standing approval for the specification of the changes generated from it, for the council's ratification of their verification and independent-review outcomes, and for their merge into the intent's integration branch. It applies only while the change stays within the approved blueprint revision and its evidence is current and passed. A use is not a new deliberation: it applies the intent decision to current evidence and records an immutable decision record bound to the change's artifact, code, and policy revisions, the evidence it ratifies, and the intent decision it uses. A stale revision, a failed or missing gate, a departure from the blueprint, a consul's request for a vote, or a policy requirement for sampling voids the standing approval for that change, which then needs a decision or returns to its parent. Since no consul deliberates in a use, decision 4 bars no voter; any actual vote follows decision 4. The owner approved this mode on 2026-10-25 to keep a campaign affordable: a vote costs up to nine agent runs (three seats, three cycles), and requiring one per change would make a large campaign impractical.
7. **Revocable delegation and audit.** Autonomy is a project setting. The owner can disable the council at any time, and approvals fall back to the human roles; recorded decisions remain history, and new decisions stop. Appointment, rotation, disablement, and every vote are audited. A disabled council cannot be re-enabled by an agent.
8. **Delivery order.** The council is constituted only after Claude Code, Codex, and OpenCode are admitted. Until then, human approvals apply. A partial or two-seat mode is not introduced; the behavior when a seat is unavailable is the open decision of decision 2, and any degraded mode needs its own owner decision.
9. **Amendments.** This ADR amends [ADR 0008](0008-product-ui-and-integration-authority.md) decision 2 in one respect: auto-merge remains the executor of integration into the project's integration branch, and the council becomes the approving authority above it. It also makes explicit the owner-only rule that decision 2 leaves untouched, that no integrator, auto-merge setting, or council approval authorizes merging the project's integration branch into `main`, and updates the [governance policy](../governance.md#authority) and the delegated principal in the [trust model](../trust-model.md#1-principals-and-identity-hierarchy).

## Forward-compatibility obligations

- The approval path is a decision-body port from the start; the human approver is one implementation, the council another.
- Decision records exist from the first approval a managed project needs, so the council can be inserted without backfilling audit.
- The harness port exposes model and effort per session, and account pools are per harness, so a seat is configuration rather than a code path.
- The board and the inbox show council decisions, dissent, and escalations, so a person can see what the council decided and why.

## Risks / trade-offs

- **Delegated authority to agents.** The council can approve integration, so a bad majority becomes a bad merge. Mitigations: it cannot waive evidence, cannot approve its own work, cannot touch policy or `main`, and its authority is revocable and audited.
- **Precedence tie-break.** Under the owner-approved default order, a 1:1:1 split is decided by Claude; the other two consuls only win together. The ranks are set at appointment, and this is the owner's chosen default, recorded as such.
- **Cost and latency.** Up to nine agent runs per decision. Standing approval keeps the cost at intent boundaries.
- **Rubber stamping.** A council that always agrees is a single approver with extra steps. Mitigations: dissent is recorded, sampling is allowed, and the reviewer stays independent.
- **Delivery order.** Autonomy arrives only after all three harnesses are admitted, which is later than G3 and after G4. Until then it is human approval, and this ADR does not move a harness earlier.

## Consequences

- The governance policy becomes version 4 and adds the delegated decision authority and the owner-only promotion into `main`.
- The trust model gains a delegated principal whose scope is bounded and revocable.
- The lifecycle's Accept and integrate stage names the council as an eligible delegated authority.
- This ADR authorizes no implementation. The owner authorizes each implementation step separately, and the forward-compatibility obligations apply meanwhile.
