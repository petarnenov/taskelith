## Context

The proof of concept's board shows a session state on each card: live, waiting for approval, waiting for instructions, idle, stopping, stopped, ownership uncertain, or no session. The other screens show the subset their sample data reaches; the session screen's scripted run has no approval step. ADR 0008 states that merging stops a change's agent session. No contract defines a session state yet.

## Goals / Non-Goals

Goal: state what the indicator shows and where. Non-goals: the session state model, its OpenAPI or AsyncAPI contract, and the SPA implementation, which belong to the gates that build them. Excluded places keep their own markers: aggregate counts, such as the board's "sessions live" summary; the workers screen, which lists machines and harness versions rather than sessions; the inbox's "Done today" rows, which record resolved items rather than a session's current state; and the steps of a card's merge progress, whose card already shows the indicator.

## Decisions

- The owner chose three modes: working (spinning), waiting (still), and stopped or no session (still and muted). The looks are design choices: a spinning arc on a muted ring; a still ring with a filled center when it waits for a person; a still muted ring with an empty center when it waits for its next admission; a muted ring, filled when stopped and dashed when there is no session; and a fourth look for the uncertain state below.
- On the reviews screen the indicator shows the reviewer's session; the implementer's session is shown on the board.
- A stopping session still spins until the worker confirms that the process ended, because the harness may still be working.
- Ownership uncertain is still and drawn in the danger color: Taskelith does not know whether the harness works, so it does not claim that it does.
- One mapping from session state to indicator is used on every screen, so the same session looks the same everywhere. The proof of concept repeats the mapping in each artboard because artboards cannot share code; the SPA implements it as one shared component.
- The indicator is decorative and the label next to it names the state, so the state does not depend on motion or color alone. Under a reduced-motion preference the arc stays still. Waiting rows also say what they wait for, in the label or in the card's note.

## Risks / Trade-offs

Many spinning cards may distract; the indicator is 14 px and spins only while a harness works or is stopping.
