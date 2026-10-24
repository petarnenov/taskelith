## Context

The architecture requires governed bootstrap work before a runtime admission service exists. Existing OpenSpec changes record publication evidence but do not define general authority or a G0 completion ledger.

## Goals / Non-Goals

Define an auditable repository workflow and expose remaining foundation gates. Do not implement admission enforcement, select unqualified integrations, or claim G0 completion.

## Decisions

Use the existing pinned OpenSpec CLI and repository artifacts as the bootstrap record. Separate author verification, independent review, owner acceptance, integration, and release. Preserve historical evidence without inventing retrospective approvals. Maintain a foundation checklist linked from the README.

## Risks / Trade-offs

Repository policy is procedural, not runtime enforcement. A successful structural validator cannot establish semantic approval. Independent review and unresolved product decisions remain explicit gates.
