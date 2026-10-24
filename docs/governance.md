# Bootstrap governance policy

Policy version: 1. Status: repository bootstrap policy; runtime enforcement is not implemented.

Owner acceptance: Petar Nenov accepted the SDLC policy on 2026-10-24 in the project conversation. On 2026-10-24, the owner explicitly authorized a separate Codex reviewer agent (`gpt-6.1-sol` with `model_reasoning_effort = "medium"`) for independent review of the current and subsequent G0 changes. Integration and release authorization remain distinct.

## Authority

The owner, Petar Nenov, defines scope and accepts product and architecture decisions. Contributors and agents may propose work, inspect the repository, and implement authorized changes. An instruction to continue authorizes the next bounded work item; it does not authorize the entire architecture roadmap.

The implementer records author checks. An independent reviewer must be a person or separately authorized agent that did not author the change; self-review is never independent review. The owner may explicitly accept a documented review exception for bounded bootstrap work. Never infer an exception from silence or mark the review as passed because an exception was granted.

The owner or an explicitly authorized integrator controls merging and pushing. Finishing local work does not itself authorize integration. Release authority follows [the release policy](releases.md): qualifying changes integrated into main may publish automatically after verification. Deployment requires separate owner authorization.

## Lifecycle and records

Every task, including inspection, documentation, maintenance, emergency work, and delegated work, binds to an OpenSpec change, without exception ([ADR 0004](decisions/0004-first-class-engineering-principles.md)). Record inspection as a task in that change when it determines the scope. Use OpenSpec 1.14.3 through `npm run openspec -- ...`; the lockfile pins its dependency tree. A future framework upgrade is its own tracked change.

| Stage | Required record and transition |
| --- | --- |
| Propose and inspect | Owner request or authorized parent scope, bounded proposal, impacted capability, and exclusions. |
| Specify and design | Testable requirements and design; documentation-only work declares no runtime impact. Record unresolved decisions rather than inventing approval. |
| Implement | Task checklist and changes within the recorded scope. Material scope expansion returns to proposal. |
| Verify | Exact commands, results, environment, relevant revision or reviewed diff, limitations, and remaining gates in `verification.md`. Run `npm test` and strict validation of changed OpenSpec artifacts. |
| Review | Record author review separately from independent findings, reviewer identity, reviewed revision, and resolution. Structural validation is not semantic approval. |
| Accept and integrate | Owner acceptance or explicit delegated authority, required review or recorded exception, and current verification. Record the integrated revision when integration occurs. |
| Close | Reconcile tasks and evidence; archive using the pinned CLI only after acceptance/integration gates are satisfied. Local completion may leave these gates pending. |

The proposal, design, capability specification, tasks, and verification record form the bootstrap evidence set. Reference the originating issue when one exists; no issue is required merely to duplicate an already recorded owner request. Task checkboxes show progress, not approval authority.

## Evidence freshness

Tie review to the actual source revision, or to a base revision and explicitly identified working-tree diff before a commit exists. Record commands against the resulting tree. Changes to requirements, policy, implementation, or verification inputs invalidate affected evidence; repeat the relevant checks and obtain renewed review before acceptance. Documentation-only edits need editorial and reference checks, not invented runtime coverage.

Do not rewrite historical records as if this policy applied before it existed. The existing bootstrap and automated-release verification records remain author evidence with their stated limits. Passing local checks does not prove CI execution, external deployment, distributed recovery, or independent review.

## Framework independence

OpenSpec is mandatory for developing Taskelith, but it is not a product kernel dependency: each managed project selects its own framework through replaceable SDLC plugins ([ADR 0004](decisions/0004-first-class-engineering-principles.md)). Runtime workflow selection, immutable per-run framework bindings, SpecKit mappings, semantic admission, and evidence enforcement are G1–G4 work. See [ADR 0001](decisions/0001-bootstrap-governance.md) and [foundation status](foundation.md).
