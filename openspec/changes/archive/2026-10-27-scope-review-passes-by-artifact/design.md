## Context

`passes.jsonl` and `findings.jsonl` of a change identify a pass by its number alone (`scripts/review-passes.ts`, `consistencyProblems`), and the reviewer statistics find a missed pass by change and number (`scripts/reviewer-statistics.ts`). A change that reviews several artifacts, each with its own passes 1 to 3, has several passes with the same number.

## Decisions

- **Optional `artifact` on both lines.** The finding schema defines `artifact` with the existing `identifier` definition, and the pass schema refers to it, as it does for the other shared properties. It is optional, so the archived records, which are not rewritten, and single-artifact changes stay valid.
- **Pass coordinates.** `PassCoordinates` (artifact, pass) is the identity of a pass within its change. `passKey` turns them into a map key, with an absent artifact as its own key; an identifier holds no space, so `"<artifact> <pass>"` cannot collide. `passName` renders them for messages: `pass 1` without an artifact, `pass 1 of artifact "x"` with one, so messages of single-artifact changes are unchanged.
- **Validation.** Duplicate summaries, the finding-to-summary match, the counts, and the `missedBy` lookup all use `passKey`. `missedBy` keeps its form, `{pass, role}`, and takes its artifact from the finding, because a pass can miss only what its own artifact holds; the rule that the missed pass is earlier than the finding's pass compares numbers within that artifact.
- **Statistics.** Pass records carry their artifact, and a miss is attributed to the record with the same change and `passKey` as the finding's artifact and `missedBy` pass. An archived change without `passes.jsonl` derives one pass per distinct artifact and pass number of its findings. Rows stay per reviewer and per role, so a reviewer who makes pass 1 of two artifacts counts two passes; the output format does not change.

## Alternatives considered

- Artifact inside `missedBy`: rejected, because a miss across artifacts has no meaning in the review process, and it would add a way to be wrong.
- Raising the `pass` maximum or numbering passes across artifacts: rejected, because each artifact has its own passes 1 to 3 under the review process, and a running number would hide which reviewer role made a pass.

## Risks

- A change that mixes lines with and without `artifact` is accepted; the line without one is its own artifact. The protocol says a multi-artifact change names the artifact; the tool does not enforce that every line of such a change does.
