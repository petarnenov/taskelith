# Bootstrap governance policy

Policy version: 3 (2026-10-24: version 2 added the independent review process; version 3 adds auto-merge as integration authority and the selectable SDLC framework, [ADR 0008](decisions/0008-product-ui-and-integration-authority.md)). Status: repository bootstrap policy; runtime enforcement is not implemented.

Owner acceptance: Petar Nenov accepted the SDLC policy on 2026-10-24 in the project conversation. On 2026-10-24, the owner explicitly authorized a separate Codex reviewer agent (`gpt-6.1-sol` with `model_reasoning_effort = "medium"`) for independent review of the current and subsequent G0 changes, and later the same day the further reviewers listed under [Independent review process](#independent-review-process). Integration and release authorization remain distinct.

## Authority

The owner, Petar Nenov, defines scope and accepts product and architecture decisions. Contributors and agents may propose work, inspect the repository, and implement authorized changes. An instruction to continue authorizes the next bounded work item; it does not authorize the entire architecture roadmap.

The implementer records author checks. An independent reviewer must be a person or separately authorized agent that did not author the change; self-review is never independent review. The owner may explicitly accept a documented review exception for bounded bootstrap work. Never infer an exception from silence or mark the review as passed because an exception was granted.

The owner or an explicitly authorized integrator controls merging and pushing. Finishing local work does not itself authorize integration. In a project managed by Taskelith, an enabled auto-merge setting, which only a project-maintainer changes, is that explicit authorization: pushing to the task's own branch is covered by a standing rule, a change whose gates have all passed is merged without a further human step, and where an earlier rule conflicts with auto-merge, auto-merge wins ([ADR 0008](decisions/0008-product-ui-and-integration-authority.md) decisions 2 and 3). Release authority follows [the release policy](releases.md): qualifying changes integrated into main may publish automatically after verification. Deployment requires separate owner authorization.

## Independent review process

These rules were set or approved by the owner on 2026-10-24; the source of each is in parentheses.

- **Authorized reviewers** (owner). Each runs read-only, with the model and effort set in the invocation, not only in the prompt. `verification.md` records the invocation; where a tool reports the model or effort in its output or log, that report is recorded as confirmation.
  - Codex CLI: model `gpt-6.1-sol`, `model_reasoning_effort = "medium"`, sandbox `read-only`. In this configuration it has had no network access.
  - Antigravity CLI: model `gemini-4-argon-medium`, effort `medium`, mode `plan`. In this configuration it has fetched public web pages.
  - Claude Code: model `claude-fable-5-1`, effort `medium`, permission mode `plan`, editing tools disallowed. It can fetch public web pages when network access is allowed; in this configuration it has queried GitHub with the `gh` CLI.
- **One reviewer per task** (owner). Each task has one assigned reviewer, and no second reviewer cross-reviews it. Re-review passes by the assigned reviewer are allowed. A switch under "Unavailable reviewer" below replaces the assigned reviewer; it is not a cross-review.
- **Rotation** (approved by the owner). Consecutive tasks go to different reviewers in turn, unless a task needs a particular reviewer.
- **Unavailable reviewer** (owner, 2026-10-25). A reviewer that is unavailable for any reason is not used for any task for the next 30 minutes. Unavailable means an error, a run that opens no session, a quota limit, or an outage. The next authorized reviewer in the rotation that is not paused becomes the task's reviewer for its remaining passes. That reviewer's first pass is given the earlier passes' findings and fixes, so that it confirms them. The pass count carries over, and `verification.md` records the failed attempts and the switch.
- **External facts** (approved by the owner). A task whose review depends on external facts goes to a reviewer with network access.
- **Proof of read-only review** (approved by the owner). Take a SHA-256 snapshot of all tracked and untracked files before and after each pass, plus any external evidence directory shared with the reviewer. A change made by the reviewer invalidates the pass.
- **Review prompt** (approved by the owner; ADR 0004). The prompt names the [ADR 0004](decisions/0004-first-class-engineering-principles.md) principles as criteria and asks for every instance of a problem, not examples. `verification.md` records the reviewer, model, effort, session ID, findings, and their resolution.
- **Before the first pass** (approved by the owner). The author self-checks the change against the review criteria and runs the evidence check, and `verification.md` records both. In this repository the evidence check means that every external link is pinned to a tag, commit, or exact version, or labeled as an unversioned page.
- **At most three passes per task** (owner). If Critical, High, or Medium findings remain after the third pass, the author stops and presents options to the owner: fix them without review (recorded as unreviewed fixes), accept them as a known risk, or defer them. Any further pass needs the owner's permission.
- **Low findings are fixed** (owner). If a pass finds only Low findings, they are fixed and recorded as unreviewed fixes, and the reviewer is not called again. Low findings reported together with higher-severity findings are fixed with them and checked in the next pass or, after the third pass, recorded as unreviewed fixes.

## Lifecycle and records

Every task, including inspection, documentation, maintenance, emergency work, and delegated work, binds to a change of the selected SDLC framework, without exception; OpenSpec is the default and this repository's framework ([ADR 0004](decisions/0004-first-class-engineering-principles.md) principle 8 as amended by [ADR 0008](decisions/0008-product-ui-and-integration-authority.md)). Record inspection as a task in that change when it determines the scope. Use OpenSpec 1.14.3 through `npm run openspec -- ...`; the lockfile pins its dependency tree. A future framework upgrade is its own tracked change.

| Stage | Required record and transition |
| --- | --- |
| Propose and inspect | Owner request or authorized parent scope, bounded proposal, impacted capability, and exclusions. |
| Specify and design | Testable requirements and design; documentation-only work declares no runtime impact. Record unresolved decisions rather than inventing approval. |
| Implement | Task checklist and changes within the recorded scope. Material scope expansion returns to proposal. |
| Verify | Exact commands, results, environment, relevant revision or reviewed diff, limitations, and remaining gates in `verification.md`. Run `make verify`, which includes `npm test` and strict validation of all OpenSpec artifacts. |
| Review | Record author review separately from independent findings, reviewer identity, reviewed revision, and resolution. Structural validation is not semantic approval. |
| Accept and integrate | Owner acceptance or explicit delegated authority (in a managed project, an enabled auto-merge setting), required review or recorded exception, and current verification. Record the integrated revision when integration occurs. |
| Close | Reconcile tasks and evidence; archive using the pinned CLI only after acceptance/integration gates are satisfied. Local completion may leave these gates pending. |

The proposal, design, capability specification, tasks, and verification record form the bootstrap evidence set. Reference the originating issue when one exists; no issue is required merely to duplicate an already recorded owner request. Task checkboxes show progress, not approval authority.

## Evidence freshness

Tie review to the actual source revision, or to a base revision and explicitly identified working-tree diff before a commit exists. Record commands against the resulting tree. Changes to requirements, policy, implementation, or verification inputs invalidate affected evidence; repeat the relevant checks and obtain renewed review before acceptance, except where the [independent review process](#independent-review-process) allows unreviewed fixes, which are recorded as such. Documentation-only edits need editorial and reference checks, not invented runtime coverage.

Do not rewrite historical records as if this policy applied before it existed. The existing bootstrap and automated-release verification records remain author evidence with their stated limits. Passing local checks does not prove CI execution, external deployment, distributed recovery, or independent review.

## Framework independence

OpenSpec is the default framework for developing Taskelith, but it is not a product kernel dependency: every project, Taskelith included, selects its framework through replaceable SDLC plugins ([ADR 0004](decisions/0004-first-class-engineering-principles.md), [ADR 0008](decisions/0008-product-ui-and-integration-authority.md)). G1 delivered the framework-neutral models and the SpecKit fixtures ([ADR 0010](decisions/0010-g1-closure.md)); runtime workflow selection, immutable per-run framework bindings, semantic admission, and evidence enforcement are G2–G4 work. See [ADR 0001](decisions/0001-bootstrap-governance.md) and [foundation status](foundation.md).
