## Context

Contract section 7 says a worker resumes after a flush failure only after a host restart or a new journal incarnation. Item 14 implemented this with `worker/journal-fault`, which holds the host boot identity; the qualification record (`docs/worker-journal-qualification.md`) describes it.

## Goals / Non-Goals

**Goals:**
- Make the contract and the `worker-journal` specification describe the record item 14 implemented.

**Non-Goals:**
- Changing the implementation or any other part of the contract.

## Decisions

- **Subtree table row.** The record is a control record, so it gets the same ownership, mode, and path rules as the others; listing it in section 2 applies them.
- **Requirement.** No `worker-journal` requirement names the subtree contents, so the requirement whose behavior the record carries out, "Flush failure stops the journal", is modified instead, keeping its full text and adding one sentence and a scenario.

## Risks / Trade-offs

- The contract now names platform sources of the boot identity → they are the ones item 14 uses and tests, and a change of source is a contract change.
