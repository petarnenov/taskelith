# ADR 0007: G0 closure, initial worker matrix, and deferrals

Date: 2026-10-24
Status: Decided by the owner on 2026-10-24 in the project conversation; the OS versions in decision 1 (Ubuntu 24.04 LTS, macOS 26) were part of the matrix option the owner chose, and the owner added that both Intel and Apple Silicon Macs must be supported. G0 is closed on `dev`; promotion to `main` is a separate, later decision.

## Context

G0's exit evidence in [architecture section 13](../architecture.md#delivery-sequence) is: a clean checkout has reproducible setup, typechecking, dependency-boundary checks, a tracked first change, and no reference to another product installation. The [foundation ledger](../foundation.md) still listed four open work items: dependency qualification, the data namespace, the worker platform, and the first integrations. Each depends on work that belongs to later gates, such as runtime state, a worker image, or a release. The owner asked to finish G0.

## Decisions

1. **Initial worker matrix.** Linux workers run in the worker container image on Ubuntu 24.04 LTS for x86_64 and arm64. macOS workers run natively on macOS 26 on both Apple Silicon (arm64) and Intel (x86_64) Macs; both are required. Native acceptance of each entry remains required before Taskelith claims support for it.
2. **Deferrals.** These items move to the gate that needs them:
   - Implementing the data namespace (identity and ownership checks, native durability): G2, when runtime state first exists.
   - Native acceptance of the worker matrix and qualification of the harnesses on Linux inside the worker image: starting in G2, when the worker image exists (macOS natively at the same time). Rows of the acceptance contract that depend on later work complete with that work: real harness and SCM workflows in G3, and resource and recovery enforcement through G6 and G7.
   - Remaining maintenance, adoption, security-channel, operational, upgrade, recovery, and nested-notice evidence for the development and release tools: G8, consistent with ADR 0003 decision 9.
   - Review of the Anthropic, OpenAI, and GitHub terms: before admission in G3.

   The other remaining gates in each qualification record are admission gates for that integration, not G0 work items. Qualification of Antigravity CLI and OpenCode belongs to their plugins after G4, and Forgejo follows once the GitHub integration is proven (ADR 0006).
3. **G0 closure.** G0 is closed: its exit evidence was reproduced from a fresh clone, and every G0 work item is either done or deferred above.

## Consequences

The architecture, the worker platform contract, and the foundation ledger record the matrix, the deferrals, and the closure. The deferred items stay visible in the ledger under their target gates. Closing G0 does not claim that any integration is admitted or that any worker platform is accepted, and it does not authorize G1 work by itself; G1 starts with its own owner-authorized changes.
