## Context

The `engineering-principles` specification already states the rule as enforced. This change applies those requirements to the two contributor texts; it sets `skip_specs: true` because no requirement changes.

## Goals / Non-Goals

Make the two texts say what the specification says about scope, exemptions, and the automated check. No change to the bound, the counting rules, the check, or any other text.

## Decisions

- List the file kinds in `AGENTS.md` exactly as the requirement "Comment length scope" does, so that a reader needs no spec lookup to know which files are in scope.
- Keep worker step 3 short: it names the file categories and the exemptions and still points to `AGENTS.md` for the full statement.
- Name the exempt fixture copy by example, the SpecKit plugin's byte-for-byte copy, as the requirement's scenario "Captured evidence" does, without a path that could go stale.

## Risks / Trade-offs

None.
