## Context

ADR 0008 kept the proof of concept out of the repository. D17 then fixed Mantine as the only UI library. The Mantine rebuild is a React application bundled into one HTML file and published as a private claude.ai artifact; its source existed only in a session's scratch directory.

## Goals / Non-Goals

Goals: make the Mantine build the recorded reference, keep its source available to item 28, and keep the specification and ADRs binding. Non-goals: start item 28, admit React or Mantine as dependencies, or change any product UI decision.

## Decisions

- A new ADR rather than an edit to ADR 0008: ADR 0008's decisions stay as decided, and only its consequence about storage changes, so ADR 0008 names the amendment and ADR 0011 carries the reason.
- The source goes under `docs/` as reference material, without `package.json` or lockfile. That keeps it out of the npm workspaces, the dependency inventory, the typecheck, and the coverage rule until item 28 ports it, and it admits no dependency before item 1. The README gives a rebuild in a scratch copy with exact versions.
- The new requirement makes the proof of concept the starting point but not a source of requirements: the specification and ADRs win, and departures are recorded per item, which keeps reviews of the UI items checkable.
- The old canvas stays published, marked as superseded with a note and a changed title, so the history of ADR 0008 stays inspectable.

## Risks / Trade-offs

The reference source can drift from later decisions; the requirement handles that by letting the specification win and recording departures. The published artifact is private until the owner shares it.
