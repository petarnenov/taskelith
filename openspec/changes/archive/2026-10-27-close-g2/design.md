## Context

ADR 0007 closed G0 and ADR 0010 closed G1 with reproduced exit evidence and deferrals that cite their source. G2 is larger: its 27 plan rows became more than 70 archived changes, because the coordinator split items 20, 21, 23, 24, and 25 into parts and item 24's scenarios produced a series of fixes. Three parts of items 24 and 25 run in parallel with this draft on other hosts.

## Decisions

1. **Draft with placeholders.** The ADR is written now with status Proposed. Every section that depends on unfinished work holds a block quote marked as a placeholder that names the change and what to record from it. No placeholder may remain when the owner accepts the ADR; the tasks list each one.
2. **Row map from proposals.** Each archived change is mapped to the plan row its proposal names ("item 20", "21b", "24c"). Changes that name no row but fix a G2 defect are listed under the row whose scenario found the defect (the B and D series under item 24) or whose code they fix. Changes that only adjust governance, reviewers, or G3 groundwork are not G2 rows and are left out.
3. **Deferrals cite their source.** Each deferral names the archived change or decision that recorded it. Where no record names a gate, the ADR marks it as the author's assignment for the owner to confirm, as ADR 0010 did. Items resolved before the closure stay listed when the coordinator named them, with the resolving change.
4. **Protocol version exception ends.** `gate-stale-epoch-observations` design D2 bounded its protocol version 1 exception by the G2 closure. The ADR states that it ends; the contract note changes when the ADR is accepted, so that a rejected draft leaves the contract as it is.
5. **Fresh clone as G1 did, plus the installation.** The reproduction clones `dev` into a scratch directory, runs `make setup` and `make verify`, and also the installation smoke and the native acceptance targets, because G2's exit evidence runs through the composition and not only through `make verify`.
6. **Ledger shape.** The foundation ledger gains a "G2 status" section like "G1 status", with a matrix-entry table for D11 (a), because D11 asks the closure to show which entries and rows stay open.

## Risks

- An author's assignment may not match the owner's intent; the owner confirms each before acceptance.
- The in-progress changes may find defects that need more fixes before the closure; the row map and the deferrals are then updated in this change.
