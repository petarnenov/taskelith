## Context

`docs/g3-plan.md` merged as a draft with D1 and D17 decided. The owner decided the remaining decisions in the project conversation on 2026-10-25, one group at a time, and chose D13 (c) against the recommendation.

## Goals / Non-Goals

Record the owner's decisions and their consequences in the plan exactly, as the `delivery-planning` requirement "Owner decisions recorded in the plan" requires. Do not decide D15, and do not start any item.

## Decisions

- Each decided row keeps its options and the author's rationale after the decision, so that the reason for each choice stays visible; D13's row states that the owner chose against the recommendation.
- D13 (c) becomes three items: delegation (38) on the control plane and the harness host, the terminal back end (39), and the terminal screen (40, UI), each small enough for one worker and one review. Items 3, 9, and 18 already name the capabilities, the wire operations, and the host side they need.
- Mantine has no terminal emulator, so a real terminal conflicts with D17's "only Mantine". The owner resolved it as D18 (a), a narrow exception for the terminal view; the alternative, a Mantine-only line view without a pseudo-terminal, is recorded as option (b).
- Acceptance and closure are renumbered to 41 and 42 so that they stay last.

## Risks / Trade-offs

node-pty is a native add-on; item 1 must show binaries or a build for every worker matrix entry. Delegation and the terminal enlarge G3 and lengthen wave 7; the longest chain does not change.
