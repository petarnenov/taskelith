## Context

The capacity refusal is one mark per worker (`capacity_refused_since`) with one sequence fence that marking and clearing share. Only a capacity declaration and the effect of an exit or `not-started` cleared it. `ObservationService.apply` rolls back an effect the domain refuses and records the observation again without effect, so a refused observation could never clear the refusal. A stale observation fails its generation check (`currentAssignment`, `attemptTask`) and is refused that way. The worker counts a slot until the assignment has ended and its execution is terminal or closed without a grant (`apps/worker/src/assignment-admission.ts`).

## Goals / Non-Goals

**Goals:** a launch rejection, `not-started`, or exit that shows a free slot ends the worker's capacity refusal at the current or a stale generation, and changes nothing else.

**Non-Goals:**

- The 24c scenario test and its B3 todo.
- The worker's local end of an assignment on `assignment-not-active` (backlog item `end-assignment-on-not-active`), and the "Ended assignments" bullet of section 8.
- Stale-epoch and quarantine evidence, which still applies nothing (launch authorization section 7).

## Decisions

### D1: the evidence effect of a rejected observation

`rejectedEffect(observation, refusal)` in `observation-effects.ts` returns the clear of the producer's capacity refusal when the refusal's reason is `stale-ownership-generation` and the type is `execution.launch.rejected`, `execution.not-started`, or `execution.exited`; otherwise none. `ObservationService.apply` passes it, or no effect, to the transaction that records the rejected observation, so the clear commits with the inbox entry and the cursor, the outcome stays `rejected`, and the rejection is still logged.

- **Alternative:** the effect catches its own stale failure, clears, and returns success. The observation would become `applied`, its rejection would not be logged, and the effect would mix the generation rule with the evidence.
- **Duplicates.** A duplicate still applies nothing; the fence would skip a second clear anyway.

### D2: every consumed launch rejection clears too

The coordinator decided (Q1 (b)) that a launch rejection at the current generation clears the refusal as well, so the rule does not depend on the generation. `launchRejection` clears it after the reporter's assignment is confirmed and before any release. A rejection naming another worker's assignment or another attempt is refused for that reason, not for a stale generation, and clears nothing.

### D3: why the evidence is safe

- **Identity.** The clear uses the authenticated producer of the observation's position, never the payload, so a worker clears only its own refusal, which a capacity declaration could clear anyway.
- **Order.** The refusal's fence keeps a refusal journaled after the observation: the clear applies only above the fence's sequence.
- **No proof beyond evidence.** A launch rejection alone does not end the worker's intent; its slot frees once the assignment's end arrives. The control plane appends that end in the transaction that ends the assignment, before any later offer on the same subject, so the next offer follows it. If the worker is still full it refuses again and is marked again: one extra offer at most, never a loop, since each clear needs a new fact.
- **Several slots.** The mark only makes the worker a candidate again; placement still counts the reservations it holds against the worker's slots.

### D4: contract text left unchanged

Launch authorization section 9's "Scheduler action" column names what the scheduler does with the assignment or task; it stays correct, since the clear is a capacity report of section 8. The section 8 "Ended assignments" bullet stays as it is (Q3 (a)).

## Risks / Trade-offs

- **An extra offer.** A clear before the worker processed the end, or while another of its attempts still fills the slot, costs one refused offer (D3).
- **Worker gap.** The worker does not end an assignment locally on `assignment-not-active`, as section 8 states; it waits for the end command. B5 does not depend on it; it is backlog item `end-assignment-on-not-active`.
