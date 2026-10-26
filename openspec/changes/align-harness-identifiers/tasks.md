## 1. Inspection

- [x] 1.1 Compare the identifiers of the account pool and agent harness port contracts, their specs, and their code
- [x] 1.2 Search the specs and contracts for a requirement to check a mechanism when a slot is added

## 2. Types and contracts

- [x] 2.1 Add `HarnessPluginId` to Execution's identifiers and export it from `@taskelith/execution`
- [x] 2.2 Make Scheduling import Execution's `HarnessPluginId` and drop its own type and re-export
- [x] 2.3 Update the account pool contract sections 1, 2, and 3.1 and the agent harness port contract sections 3 and 4.1
- [x] 2.4 Add the `account-pool-port` spec delta (requirement "Shared harness plugin identifier")

## 3. Verification and review

- [x] 3.1 Run `npm run openspec -- validate align-harness-identifiers --strict` and `make verify`
- [x] 3.2 Record the evidence in `verification.md`
- [ ] 3.3 Independent review by the assigned reviewer (OpenCode, `opencode-go/kimi-k3.1-pro`, high effort)
