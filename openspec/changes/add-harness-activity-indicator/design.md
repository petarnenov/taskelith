## Context

The proof of concept shows a session state wherever a harness session appears: live, waiting for approval, idle, stopping, stopped, ownership uncertain, or no session. ADR 0008 states that merging stops a change's agent session. No contract defines a session state yet.

## Goals / Non-Goals

Goal: state what the indicator shows and where. Non-goals: the session state model, its OpenAPI or AsyncAPI contract, and the SPA implementation, which belong to the gates that build them. Aggregate counts, such as the board's "sessions live" summary, and the workers screen, which lists machines rather than sessions, keep their own markers.

## Decisions

- Three visual modes, chosen by the owner: working (a spinning arc), waiting (a still ring; a filled center when it waits for a person), and stopped or no session (a muted still ring, filled when stopped and dashed when there is no session).
- A stopping session still spins until the worker confirms that the process ended, because the harness may still be working.
- Ownership uncertain is still and drawn in the danger color: Taskelith does not know whether the harness works, so it does not claim that it does.
- One mapping from session state to indicator is used on every screen, so the same session looks the same everywhere.
- The indicator is decorative and the label next to it names the state, so the state does not depend on motion or color alone. Under a reduced-motion preference the arc stays still. Waiting rows also say what they wait for, in the label or in the card's note.

## Risks / Trade-offs

Many spinning cards may distract; the indicator is 14 px and spins only while a harness works or is stopping.
