# Design

## Context

On 2026-10-28 the owner replaced the review assignment of policy version 5
and the conditional pass 3 of version 6 (paraphrased from Bulgarian): pass 1
Codex CLI (gpt-6-astra) at `medium`, pass 2 Claude Code (claude-opus-5-5) at
`medium`, and pass 3 Codex CLI (gpt-6.1-sol) at `medium`, run in this order
until a pass has only Low findings, which are then fixed without another
review; the coordinator, as architect, checks the fixes that no review
covers. The owner confirmed the wide scope of this change the same day and
excluded `docs/fleet.md`. The coordinator (Niki) decided the open questions
Q1 to Q6 as architect on 2026-10-28; the decisions below record them.

## Goals and non-goals

- Goals: one rule in governance, the protocol, `AGENTS.md`, and the three
  skills; the tooling (`make review`, the route table, the invocation keys,
  the Jev question) aligned with it; archived records left valid.
- Non-goals: authorizing routed effort, any other process lever, adding
  workers to `docs/fleet.md`, and rewriting archived records.

## Decisions

### D1. Review sequence and stop rule

Governance policy version 8 replaces "Two alternating reviewers per task"
and "Conditional third pass" with "Review sequence". Each pass has its own
reviewer from "Reviewer assignment". The passes run in order until a pass
reports only Low findings or none. Pass 3 runs exactly when pass 2 reported
a Medium, High, or Critical finding, whatever files its fixes touch, so the
record-only exemption of version 6 is gone. "At most three passes" and "Low
findings are fixed" stay.

### D2. Network tasks (Q1, decision N1)

A task that needs network access has Claude Code (claude-fable-5-1) for
passes 1 and 3 and Claude Code (claude-opus-5-5) for pass 2, each at
`medium`. Adjacent passes then share the Claude Code harness with different
models. Governance names this an accepted exception for network tasks that
holds only until a networked reviewer of another harness is available, for
example Antigravity CLI after its pause. The route table records it as the
networked reviewers of passes 1 and 3 (`networkedReviewer` of the pass 1
and pass 3 seats in `scripts/review-route.ts`).

### D3. Roles kept by pass (Q2, decision R1)

The records keep the roles of versions 5 to 7: pass 1 role A (astra),
pass 2 role B (opus), and pass 3 role A (sol). `finding.schema.json` and
`pass.schema.json` keep `A` and `B`, no archived record changes, and
`make findings ARGS="reviewers"` stays comparable with history: its rows
per reviewer separate astra and sol, and its role A row covers the Codex
reviewers of passes 1 and 3, which the protocol's "Reviewer statistics"
now says. Only the role description of `finding.schema.json` changes.
`make review` takes the role from `PASS` when `ROLE` is empty (A for
passes 1 and 3, B for pass 2); a given `ROLE` is still validated against
the pass, and a pass after 3 still needs `ROLE`. The Makefile passes an
unset `ROLE` as an empty argument, so it needs no change.

### D4. Rule version 2 (Q3)

`RULE_VERSION` becomes 2. Its reviewer table is a list of pass seats, each
with a pass, a role, a reviewer, a networked reviewer, and an effort per
tier; version 1 keeps its two seats unchanged, so its archived records
validate against their own table. Both versions share the trigger
thresholds. Pass 3 is planned but conditional: the summary prints it as
"only after a pass 2 with a Medium or worse finding", and `route.json`
carries no extra property for it. `route.schema.json` makes `rule` a
`oneOf` by version: version 1 with exactly two pass plans, version 2 and
later with exactly three; the shadow's pass plans take either shape, and
validation checks them against the rule version's table. A test checks
that a version-1 record still validates and that a pass count of the
other version fails. `make review` picks the plan of the same pass number
and, for pass 3 of a version-1 record, pass 1's plan, as version 1 meant.

### D5. Pass 3 scope and the cap (Q4, decision P2)

Pass 3 is a full review of the current diff that also checks every pass 2
fix. A Medium or worse finding of pass 3 is fixed without another review,
recorded as `fixed-unreviewed`, and goes to the coordinator's architect
check; governance says so in "At most three passes per task". A finding
that the author does not fix still goes to the owner, who accepts it as a
known risk or defers it, and a fourth pass still needs the owner.

### D6. Architect check of unreviewed fixes

Every fix that no later pass reviews, the fixes of a Low-only pass and the
fixes after pass 3, is checked by the coordinator as solution architect
before integration. The check is one line in the change's `verification.md`
or, for a branch already archived, in the integration pull request's body,
because the coordinator does not edit an archived record.

### D7. Elevated efforts per pass (Q5)

The `elevated` efforts are keyed per pass: pass 1 `high`, pass 2 `xhigh`,
and pass 3 `high`, the same tier mapping as pass 1. They stay unauthorized
and shadow-only; this change authorizes none of them, and `make review`
still prints that the authorized effort applies.

### D8. Opus at `medium` (Q6)

Governance's authorized entry for Claude Code (claude-opus-5-5) and the
assignment table name effort `medium`, together with the new invocation
key `claude claude-opus-5-5#medium`. The key `#high` stays accepted as a
fallback, for example for a review of a tree that predates the new key.

### D9. Jev criterion change

The shadow question keeps its instructions and the threshold 0.4, and Jev
stays shadow-only. Its criteria follow the stop rule:

- true: "The reviewer of pass 2 will find a Medium, High, or Critical
  issue."
- false: "The review ends at a Low-only or clean pass 1 or pass 2."

The context's review sentence states the sequence and the stop rule. The
reference rates and the archived records still reflect the version 6 rule,
under which a Medium-only pass 2 with record-only fixes ended the review,
so the base rate understates pass 3 under the new rule. The re-evaluation
after 30 to 40 newly routed and archived changes stays as the archived
`improve-jev-route-request` change set it, and it should count only changes
reviewed under version 8.

## Risks

- **Mixed history.** Role A now covers two reviewers; per-reviewer rows
  stay exact, but a role A trend across 2026-10-28 compares different
  models.
- **Route effect.** The `effect` routing section compares only the
  reviewers of passes 1 and 2 with the route, as before; pass 3 is not yet
  part of "followed the route". A later change can add it.
- **Tasks in review.** Governance names no transition for a task already
  in review when version 8 reaches `dev`; the coordinator decides such a
  task.
