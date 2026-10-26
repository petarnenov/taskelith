## 1. Contract

- [x] 1.1 Record the owner's 2026-10-26 G3 start decision in `docs/g3-plan.md` (status and dependency order)
- [x] 1.2 Write `docs/contracts/product-ports.md`
- [x] 1.3 Add the `product-ports` spec delta

## 2. Port types

- [x] 2.1 Add `BoardReadModel`, `NeedsYouInbox`, `NeedsYouSource`, and `StandingApprovalRules` with their constants to Execution, and export them
- [x] 2.2 Add the `@taskelith/integrations` package with `IntakeSource`, `WriteBack`, `AutoMergeSettings`, and `MergeQueue`
- [x] 2.3 Add tests that pin the contract constants in both modules
- [x] 2.4 Regenerate the dependency inventory

## 3. Verification and review

- [x] 3.1 Run `make verify`
- [x] 3.2 Independent review by the assigned reviewer (Claude Code, `claude-fable-5-1`, medium effort)
- [x] 3.3 Record the evidence in `verification.md`
