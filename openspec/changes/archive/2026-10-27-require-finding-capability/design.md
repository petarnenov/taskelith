## Context

`scripts/review-findings.ts` holds the pure rules of the review findings record and `scripts/findings.ts` the file access and command line. Validation already treats active and archived changes differently: only active changes must have a `findings.jsonl`. The checklist ranks the categories of archived findings that match the given capabilities or file globs.

## Goals / Non-Goals

**Goals:** record findings reach every brief; new code and doc findings carry a capability that exists; archived records stay untouched and valid.

**Non-Goals:** rewriting archived findings, a schema-level capability rule, changes to the index, and a capability vocabulary other than the `openspec/specs` directories.

## Decisions

1. **Record finding by path.** A finding is a record finding when its `file` starts with `openspec/changes/` (`isRecordFinding`). The schema already rejects absolute paths and `..`, so the prefix cannot be bypassed. The rule covers active and archived paths, so the 17 archived record findings without a capability are recognized without a rewrite.
2. **Record quality in every checklist.** `recordChecklist` ranks the categories of archived record findings with the same ranking as `checklist` (count, then id, newest example title, `--top` items), through a shared `rankCategories`; `formatRecordChecklist` and `formatChecklist` share `formatRanking`. `findings.ts` prints the query section, a blank line, and the "Record quality" section, also when either is empty. Record findings that match the query stay in the query section too, so the existing contract does not change.
3. **Capability rule in the pure rules, the directory list at the edge.** `FindingRules` gains an optional `capabilities` set. When it is given, a finding outside `openspec/changes/` must name a capability, and any named capability must be in the set; a record finding may omit it. `findings.ts` lists the directories under `openspec/specs` and passes the set only for active changes, as it already requires the file only there. A capability that a record finding names is checked too, because a nonexistent capability would misroute the checklist as much as a missing one.
4. **No schema rule.** A JSON Schema cannot check that a directory exists, and a conditional `required` would fail the four archived code and doc findings without a capability. The schema's capability description states the rule, which the tool enforces.
5. **Changes that skip specs.** A documentation-only change with `skip_specs: true` has no delta, so its author names the closest existing capability, as the protocol and the task-protocol skill now say.

## Risks / Trade-offs

- Active changes on other branches that record code or doc findings without a capability fail `make findings ARGS="validate"` after they merge `dev`; the message names the line and the fix.
- The 4 archived code and doc findings without a capability still miss capability-based checklists; they appear only when a file glob matches them. Rewriting them was excluded by the brief.
- The "closest capability" for a change that skips specs is the author's judgment; the tool checks only that it exists.
