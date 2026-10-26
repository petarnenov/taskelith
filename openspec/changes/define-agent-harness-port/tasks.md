## 1. Contract

- [x] 1.1 Write `docs/contracts/agent-harness-port.md`
- [x] 1.2 Add the `agent-harness-port` spec delta

## 2. Port types and suite

- [x] 2.1 Add `AgentHarness` with its contract constants to Execution, and export them
- [x] 2.2 Add the parsers of the capability declaration and of harness events
- [x] 2.3 Add `runAgentHarnessConformance` and `ScriptedAgentHarness`
- [x] 2.4 Add tests that pin the constants, run the suite against the scripted harness, and show each check on a broken harness

## 3. Verification and review

- [ ] 3.1 Run `make verify`
- [ ] 3.2 Independent review by the assigned reviewer (OpenCode, `opencode-go/kimi-k3.1-pro#high`)
- [ ] 3.3 Record the evidence in `verification.md`
