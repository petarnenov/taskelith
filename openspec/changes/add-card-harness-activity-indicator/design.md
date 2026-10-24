## Context

The proof-of-concept board shows a session state on each card: live, waiting for approval, idle, stopping, stopped, ownership uncertain, or no session. ADR 0008 states that merging stops a change's agent session. No contract defines a session state yet.

## Goals / Non-Goals

Goal: state what the card indicator shows. Non-goals: the session state model, its OpenAPI or AsyncAPI contract, and the SPA implementation, which belong to the gates that build them.

## Decisions

- Three visual modes, chosen by the owner: working (spinning arc), waiting (a still ring; a filled center when it waits for a person), and stopped or no session (a muted still ring).
- A stopping session still spins until the worker confirms that the process ended, because the harness may still be working.
- The spinner is decorative and the card keeps its text label, so the state does not depend on motion or color alone; under a reduced-motion preference the arc stays still.

## Risks / Trade-offs

Many spinning cards may distract; the indicator is 14 px and stops for every state except working.
