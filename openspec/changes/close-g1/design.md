## Context

ADR 0007 closed G0 with reproduced exit evidence and owner-decided deferrals. G1 follows the same pattern, but its items ran under the owner's authorization of 2026-10-24 to merge each reviewed item, so most deferrals already follow recorded decisions: the G1 plan's scope lines, decision D4 (a), item designs, ADR 0009, and the G2 work plan.

## Decisions

1. **Exit evidence by test.** ADR 0010 names the test files that show each part of the section 13 exit evidence, so a reader can rerun them; the verification record reruns them in a fresh clone through `make verify`.
2. **Deferrals cite their source.** Each deferral names the decision or record that moved it. Two items have no named gate in their records (the generated manifest type and a SpecKit run on arm64); ADR 0010 assigns them to G4 and marks that as the author's assignment; the owner accepted both on 2026-10-25. Review pass 1 found more open work without a gate, which ADR 0010 assigns the same way for the owner to confirm.
3. **Section 15 wording.** The readiness paragraph keeps the four pre-G2 contracts as G2 work, points to G2 plan items 3 to 6, and states that the both-framework mapping feasibility was resolved by ADR 0009.

4. **Purpose at archive.** The `foundation-closure` Purpose describes only G0; the archive rewrites it to cover the closure of G0 and G1.

## Risks

- The two author's assignments may not match the owner's intent; the closure report asks the owner.
