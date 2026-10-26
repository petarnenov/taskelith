## Context

Architecture section 7 lists the capabilities the first real agent adapter must specify and forbids advertising one merely because a generic port has a method for it. ADR 0003 decision 8 makes harnesses plugins on a microkernel, with no harness named in kernel or module code, and its consequences require the conformance suite to be written for the port and checked against a second harness before the port is frozen. Decision 11 requires external answers to native permission requests. ADR 0005 adds the subscription mechanisms and the load, limit, and reset signals a plugin declares. The Claude Code qualification ("Consequences for the agent port") and the supervisor identity contract (process group on macOS) add obligations. G3 decision D13 (c) implements delegation and a web terminal in G3.

## Goals / Non-Goals

**Goals:**

- One reviewed contract that fixes the capabilities, operations, events, outcomes, failures, and obligations that items 18, 19, 38, and 39 implement.
- Port types, parsers of plugin data, and a conformance suite that a plugin's tests run, proven against a scripted test harness.

**Non-Goals:**

- A real harness plugin (item 19), the harness host (item 18), the account pool (items 5 and 12), the session timeline (item 4), and wire schemas (item 9).
- Freezing the port in the plugin SDK, which follows the second harness in G4.

## Decisions

1. **Port in the Execution module.** Architecture section 6 names `AgentHarness` as a port and gives Execution the ownership of sessions, attempts, and approvals, so the port, its parsers, and its suite live there. A separate module would change the architecture, and the plugin SDK would freeze the port before the second harness has checked it.
2. **Plain data at the plugin boundary.** As with the frozen SDLC framework port, requests, results, and events are plain data that the module parses. The parsers read own data properties only, so an accessor or a proxy in plugin output cannot run plugin code, and an unknown field is rejected, so an event cannot carry data the port does not define, such as a credential.
3. **Generations instead of trusting native IDs.** The host numbers each native process of a session, and every request names the generation. A response, interrupt, or turn for an earlier process fails, and a native request ID is keyed with its generation, so a reused native ID never receives an earlier answer.
4. **Pull-based events.** `events` returns an async iterable with one subscriber per generation that ends after `session-ended`. The host controls its reading pace, and the conformance suite can apply a timeout to every wait.
5. **Classification by the plugin, scope by the host.** The plugin classifies a permission request only as a harness-neutral `push` to a full ref, and only when the action does exactly that. The host decides whether the ref is the task's branch, which the plugin does not know, and maps it to the standing rule operation `push-to-task-branch`.
6. **Delegation and terminal as optional capabilities.** D13 (c) implements both in G3, but a later harness may lack them. The delegation result is the response to the native delegation request, so the single-response rule gives delivery once by correlation; the terminal is a program description that the host runs, so the plugin starts no process outside the host's control.
7. **The scripted harness in the module's adapters.** Like the in-memory adapters, `ScriptedAgentHarness` is exported so that item 18's host tests can use it; it is a test double that no installation runs.

## Risks / Trade-offs

- **One harness behind the contract.** The contract draws on one qualified harness. G4 may find a rule that a second harness cannot meet; the port stays at an unfrozen `0.1.0` until then, and a contract change follows.
- **Contracts before the G2 closure.** If the G2 closure defers something this port relies on, a follow-up change corrects it, as the owner decided on 2026-10-26.
- **Obligations the suite cannot check.** The pinned binary digest, disabled self-update, the write set, and process-group containment need a real harness; the contract assigns them to items 18, 19, and 35.
