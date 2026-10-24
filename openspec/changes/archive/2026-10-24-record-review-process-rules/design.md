## Context

The governance policy required independent review but did not name the authorized reviewers, how they are invoked, how many passes are allowed, or how findings are handled after the cap. Its evidence-freshness rule required renewed review after every change, which conflicts with the owner's rule for Low-only passes.

## Goals / Non-Goals

Record the owner's rules as checkable policy and reconcile them with evidence freshness. Do not add tooling, change CI, or rewrite earlier verification records.

## Decisions

- Name each reviewer with its model, effort, and read-only mode, because the owner requires these to be set in the invocation, not only in the prompt.
- Require SHA-256 snapshots before and after each pass as the proof of read-only review, as the owner approved; earlier reviews used them only in part.
- Attribute each rule to the owner or to an owner approval, so no author practice is recorded as an owner decision.
- Keep the owner's options after the pass cap explicit and record unreviewed fixes as such, rather than counting them as reviewed.
- Add an explicit exception to evidence freshness for unreviewed fixes that the review process allows, so the two rules do not contradict.

## Risks / Trade-offs

Unreviewed fixes after a Low-only pass or by owner choice can introduce errors; recording them as unreviewed keeps that visible.
