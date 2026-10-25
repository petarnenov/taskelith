## Context

ADR 0005 decision 4 puts a slot into cooldown on a reported limit; decision 5, as amended on 2026-10-25, fixes a session's harness and slot until the session is closed, and a new session of the task gets both by the normal selection. Without a further rule, the session after a limit could take another slot of the same harness, which the terms reviews tie to "rotating accounts".

## Goals / Non-Goals

**Goals:**
- Record the owner's rule for a limit: handoff, stop, a new session on a different harness, or a wait for the cooldown.
- Make the rule visible in the G3 items that produce, store, and consume the handoff, and in the selection.

**Non-Goals:**
- The handoff's format or content, which items 4 and 18 define.
- Changing D15, the cooldown period, or any code.
- A legal conclusion on whether the rule satisfies any provider's terms.

## Decisions

- **Placement.** The rule is triggered by a limit signal, so it is an amendment to decision 4 ("Cooldown"); decision 5's amendment points to it so that its general rule for an unavailable slot no longer covers a limit.
- **After the wait.** The owner said the task waits for the cooldown. The amendment reads this as waiting for the cooldown of the slot that reported the limit and continuing on that slot, because taking another slot of the same harness once the wait ends would still move the work to another account of that harness because of the limit. The new session still reads the handoff.
- **Plan items.** Item 4 owns the session model, so it keeps the handoff for the next session; item 13 implements item 4 and needs no clause of its own. Items 5 and 12 own the selection contract and its implementation, so they carry the different-harness choice and the wait. Item 18 observes limit signals in the worker, so it writes the handoff, stops the session, and gives the handoff to the next session.
- **Spec delta.** The "Session affinity" requirement is modified again; the cooldown scenario keeps its name and now covers a limit with another eligible harness, a scenario covers a limit without one, and the new-session scenario is limited to sessions closed for another reason.

## Risks / Trade-offs

- A project with one harness waits for every limit instead of using its other slots → accepted by the owner's rule.
