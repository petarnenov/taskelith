## Context

The mapping document is G1 preparation input dated 2026-10-24; ADR 0009 froze the port later, and the OpenSpec and SpecKit plugins define the stage graphs (`stagesOf` in the OpenSpec framework, `SPECKIT_WORKFLOW` in the SpecKit mapping cases). The G3 plan's starting point paraphrases the trust contract's roles.

## Goals / Non-Goals

Make both records agree with the code and the trust contract. Do not rewrite the dated observations, and do not change any requirement.

## Decisions

- The mapping table records what was observed upstream before G1, so it is kept and a dated note names the port's differences, the same way the document's section "Remaining after the port froze" already does.
- The role list is corrected in place, because it summarizes the trust contract and has no history of its own.

## Risks / Trade-offs

None beyond keeping the note in step with the stage graphs if they change; the note names the source files.
