## Why

Architecture section 7 requires the first real agent adapter to specify its native capabilities, and ADR 0003 requires the harness port and its conformance suite to be written for the port, not for the first harness. G3 items 18 (harness host), 19 (first harness plugin), 38 (delegation), and 39 (web terminal) build on this port, and item 9 depends on it. On 2026-10-26 the owner started G3 for the wave 1 contracts, items 3, 5, 6, 7, and 8, in parallel with G2. This change is G3 work plan item 3.

## What Changes

- Add the agent harness port contract (`docs/contracts/agent-harness-port.md`): declared capabilities, sessions and generations, host-generated turn IDs mapped to native correlation, native permission, input, and delegation requests with a single response, the terminal program, turn outcomes, session end, and error mapping, subscription mechanisms and account signals, pinned binaries with self-update disabled, the process-group obligation on macOS, and the conformance suite.
- Add the `AgentHarness` port types and contract constants to the Execution module, with the parsers of the capability declaration and of harness events.
- Add the harness-neutral conformance suite `runAgentHarnessConformance` and the scripted test harness `ScriptedAgentHarness`, with tests that run the suite against it and against broken variants.
- No real harness plugin, no harness host, no account pool, and no wire schema. The port is not frozen in the plugin SDK.

## Capabilities

### New Capabilities

- `agent-harness-port`: the module-owned port through which Taskelith drives an agent harness, its declared capabilities, its rules for turns, requests, outcomes, and errors, and its conformance suite.

### Modified Capabilities

None.

## Impact

- New exports from `@taskelith/execution`.
- No new dependency, and no change to `package-lock.json` or the dependency inventory.
- No runtime behavior changes; the published `taskelith` package is unchanged.
