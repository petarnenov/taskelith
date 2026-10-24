## Context

The decisions come from the owner's review of a private design canvas outside this repository. The canvas is reference material; ADR 0008 is the binding record. Four earlier rules conflict with the decisions: governance merge authority, ADR 0003 decision 11, the architecture's ban on default approvals, and ADR 0004 principle 8.

## Goals / Non-Goals

Goals: record each decision once (ADR 0008), make the conflicting rules point to it, and state the requirements the later gates must meet. Non-goals: implementing any UI, merge automation, intake, or framework selection; choosing libraries; changing the release or deployment policy.

## Decisions

- **Amend, do not rewrite.** ADR 0003 and ADR 0004 keep their original text and gain dated amendments, so the history stays readable.
- **Auto-merge wins, but within the existing safety rules.** The conflicts are resolved by making the enabled setting the explicit integrator authorization and a maintainer's standing rule an explicit, audited approval policy. External approvals for harnesses, independent review, and the ban on falling back to the implementer stay in force.
- **Framework selection keeps the binding rule.** "Mandatory OpenSpec" becomes "every task binds to the selected framework, OpenSpec by default". This repository keeps OpenSpec until another framework's pinned tooling has been admitted, so no current instruction changes in practice.
- **Two new capabilities.** UI requirements and merge authority change for different reasons, so they are separate specs.
- **Lifecycle order.** The board follows governance's stage order, Verify before Review; the conflict flow therefore verifies the new head before the resolved diff is reviewed.

## Risks / Trade-offs

- Auto-merge without a human step depends on the quality of verify and independent review; a weak gate now merges directly. Mitigation: the attempt budget, escalation, and the rule that review never falls back to the implementer.
- Standing approval rules weaken the per-request approval model. Mitigation: author, scope, and policy revision are recorded; every use is audited; turning auto-merge off revokes the push rule.
- Allowing another framework for Taskelith could split the repository's evidence across two formats. Mitigation: tooling admission first, and existing work keeps its binding.
