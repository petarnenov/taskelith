# Agent harness port contract

Date: 2026-10-26. Status: proposed contract for G3 ([G3 work plan](../g3-plan.md) item 3, `define-agent-harness-port`), under independent review. It defines `AgentHarness`, the port through which Taskelith drives an agent harness: the capabilities a harness plugin declares, sessions and their generations, host-generated turn IDs, native permission, input, and delegation requests with a single response, the terminal program, terminal outcomes and error mapping, the subscription mechanisms and account signals of [ADR 0005](../decisions/0005-harness-subscription-account-pools.md), pinned binaries, the process-group obligation on macOS, and a harness-neutral conformance suite run against a scripted test harness. G3 items 18 (harness host in the worker), 19 (the first harness plugin), 38 (delegation), and 39 (web terminal) implement it, and item 9 carries its observations onto the wire.

## 1. Purpose and parties

[Architecture section 7](../architecture.md#7-plugins-and-execution-isolation) requires the first real agent adapter to specify native support for chat, prompt correlation, resume, permission and input requests, interruption, and exit observation, and forbids advertising a capability merely because a generic port has a method for it. [ADR 0003](../decisions/0003-first-integrations-and-plugin-kernel.md) decision 8 makes every harness a plugin on a microkernel, and its consequences require the port and its conformance suite to be written for the port, not for the first harness, and to be checked against a second harness before the port is frozen. Decision 11, as amended, requires every harness plugin to answer native permission requests from an external client.

| Party | Role |
| --- | --- |
| Harness plugin | Implements `AgentHarness` for one harness, declares its capabilities, and maps native correlation, requests, outcomes, and errors onto the port |
| Harness host | The worker runtime of item 18: starts and resumes sessions, submits turns, persists requests before they are shown, relays responses, and parses every plugin result and event |
| Execution module | Owns the port types, the parsers of plugin data, the conformance suite, and the scripted test harness (`@taskelith/execution`) |

The port belongs to the Execution module, which owns sessions, attempts, and approvals, and which [architecture section 6](../architecture.md#modules) names as the owner of `AgentHarness`. It is an internal, unfrozen port at version `0.1.0`: the plugin SDK does not carry it yet, and it is frozen there only after the second harness passes the same suite in G4 (ADR 0003 consequences). Where the plugin code runs relative to the per-execution supervisor ([supervisor identity contract](supervisor-identity.md)) and how the host reaches it are item 18's; the port assumes only that one harness session runs inside one execution, so that its processes are the execution's process set.

## 2. Common rules

1. **Neutrality.** No type, value, or test of the Execution module names a harness, vendor, model, or native field. Native identifiers appear only as opaque strings: the native session ID and the native request ID.
2. **Plain data.** The port exchanges plain data with string, number, and boolean fields, as the frozen SDLC framework port does ([ADR 0009](../decisions/0009-frozen-sdlc-framework-port.md)). Plugin output is untrusted: the host parses the capability declaration with `parseAgentHarnessCapabilities` and every event with `parseHarnessEvent`, which read own data properties only and reject an unknown field, a missing field, an unknown value, or an accessor as `invalid`. Labels such as IDs and versions are 1 to 128 characters; free text in an event is at most 65,536 characters (`MAX_HARNESS_TEXT_LENGTH`), and a plugin splits longer output into several events.
3. **Results, never throws.** Every operation returns a kernel `Result`. An operation that throws, or returns anything other than a `Result`, breaks the contract. The failure codes are those of section 9.3.
4. **Credentials.** The slot credential reaches the plugin only in the start or resume request of the run that reserved the slot (ADR 0005 decision 6). It never enters an event, a failure message or detail, a log, a prompt, or a terminal program.
5. **Generations.** A session's **generation** counts its native processes. The host starts a session at generation 1 and uses the next generation for every resume. Every later request names the generation it was made for; a request for a generation other than the session's current one fails with `precondition-failed`, so a response, a turn, or an interrupt meant for an earlier process is never applied to a later one.
6. **Ordering and persistence are the host's.** The plugin reports what happened. The host persists each request before it is shown, consumes each response once in its journal, and reconciles after a restart ([architecture section 7](../architecture.md#durable-chat-turns-and-provider-approvals)); G3 item 4 defines the session timeline that records them.

## 3. Declared capabilities

A plugin declares `capabilities` as plain data: `supported`, `subscriptionMechanisms`, `accountSignals`, and `binaries`. A capability is declared only when the harness supports it natively and the plugin passes its conformance scenario.

| Capability | Required | Meaning |
| --- | --- | --- |
| `chat` | Yes | Several turns in one native session, each answered in the context of the earlier ones |
| `prompt-correlation` | Yes | Every turn event carries the host's turn ID (section 6) |
| `resume` | No | A new native process continues an ended session under the same native session ID (section 5) |
| `permission-requests` | Yes | The harness asks before an action, and an external client allows or denies it (ADR 0003 decision 11) |
| `input-requests` | No | The harness asks the user for text other than a permission |
| `interruption` | Yes | The running turn can be stopped from outside, and it ends as `interrupted` |
| `exit-observation` | Yes | The end of the session is reported with its reason (section 9) |
| `delegation` | No | The agent can request a child task and receives its result by correlation (section 7.4) |
| `terminal` | No | The plugin gives a terminal program for a running session (section 8) |

An operation that needs an undeclared capability fails with `unavailable`, whatever the session or request: `resumeSession` without `resume`, `terminalProgram` without `terminal`, and a response of kind `input` or `delegation-result` without `input-requests` or `delegation`. An event of an undeclared request kind or account signal is rejected by the parser. The [G3 plan](../g3-plan.md) decision D13 (c) implements delegation and the terminal in G3, so the first plugin declares them once its scenarios pass; the port keeps them optional because a harness may lack them.

## 4. Subscriptions, pinned binaries, and platforms

### 4.1 Subscription mechanisms and account signals

`subscriptionMechanisms` names one or more of `subscription-token` (a long-lived token per slot, injected per run) and `device-login` (a login whose state is stored per slot and handed over as the session's state directory). Every slot uses one mechanism its harness declares (ADR 0005 decision 2), and a start or resume request whose credential names an undeclared mechanism fails with `invalid`. The plugin injects the credential into its harness for this session only, and that harness's qualification shows whether the agent's own commands can read it (ADR 0005 risks).

`accountSignals` names the signals the plugin reports, as `account-signal` events:

| Signal | Event | Use |
| --- | --- | --- |
| `usage` | `signal: 'usage'` with `usage`, a fraction from 0 to 1 of the slot's current usage-window limit | The least-loaded tie-breaker of ADR 0005 decision 3 |
| `limit` | `signal: 'limit'`, when the harness reports a rate or usage limit | Cooldown of the slot (ADR 0005 decision 4) and the handoff of the session |
| `reset-time` | `resetsAt` on a `limit` event, an ISO 8601 UTC instant | The end of the cooldown; without it, a bounded default applies |

`reset-time` requires `limit`. A plugin that reports no signals declares none; the pool then counts active sessions and applies the default cooldown (ADR 0005 risks). A turn stopped by an account limit ends as `account-limit-reached` (section 9); the host then writes the session's handoff and stops it, and its work continues in a new session as ADR 0005 decision 4 sets out. Selection, cooldown, and handoff are items 5, 12, and 18, not this port.

### 4.2 Pinned binaries and self-update

`binaries` pins one harness binary per supported platform: the platform, the exact version, and the SHA-256 digest of the binary, 64 lowercase hex digits. The platforms are `linux-x64`, `linux-arm64`, `darwin-x64`, and `darwin-arm64`, each at most once; a platform without a pinned binary is not supported. Obligations:

- The host verifies the binary's digest against the declaration before it starts a session and refuses a mismatch. The plugin runs only the pinned binary, never a newer one found on the host.
- The plugin disables the harness's self-update in every session it starts. A harness that cannot disable it is not admitted.
- A harness run writes only inside the session's working directory, its state directory, and the execution's temporary directory. The harness qualification checks this with before-and-after listings, as the `harness-qualification` specification requires.
- An upgrade is a new pinned version, a new declaration, and a new qualification run.

### 4.3 Process group on macOS

On macOS the supervisor's termination evidence rests on the child's process group ([supervisor identity contract](supervisor-identity.md) section 8). A plugin may pin a `darwin-*` binary only when the harness qualification shows that every process the harness starts stays in its process group; a harness that does not is not supported on macOS. The plugin itself never starts a process in a new session or process group.

## 5. Sessions

| Operation | Request | Result |
| --- | --- | --- |
| `startSession` | The host's `sessionId`, generation 1, the working directory, the state directory, and the slot credential | The native session ID |
| `resumeSession` | As start, with the native session ID and the next generation | The same native session ID |
| `events` | The native session ID and generation | An async iterable of the generation's events |
| `closeSession` | The native session ID and generation | Nothing |

- **Start.** A start with a `sessionId` the plugin already started fails with `conflict`. A generation that is not a positive integer fails with `invalid`.
- **Events.** Each generation has one subscriber: a second `events` call fails with `conflict`. The stream ends right after the generation's `session-ended` event, which comes exactly once and last.
- **Close.** Closing stops the harness and its processes, ends a running turn as `interrupted`, and ends the stream with `session-ended` of reason `closed`. Closing an ended session at its generation returns success and changes nothing. After close, every operation of that generation fails with `precondition-failed`.
- **Resume.** Only an ended session resumes, at a generation above its last one; otherwise the resume fails with `precondition-failed`. A resumed session keeps its native session ID and its history, including the turn IDs it has seen. A native request that was pending when the earlier process ended does not survive into the new generation: a response to it fails with `not-found` (section 7.3).
- **Unknown session.** A native session ID the plugin does not know fails with `not-found`.

## 6. Turns and prompt correlation

`submitTurn` sends one user turn: the native session ID, the generation, a **turn ID**, and the text. The host generates the turn ID, and it is the turn's immutable identity in the session timeline (item 4). The plugin maps it to its harness's native correlation field and maps each native event back to it, so that every `output`, request, and `turn-ended` event names the turn it belongs to.

- **One turn at a time.** Turns are serialized: submitting while a turn runs fails with `precondition-failed`. No harness declares concurrent turns in G3.
- **No second submission.** A turn ID the native session has seen, in any generation, fails with `conflict` and is not sent again. A host that cannot tell whether a turn reached the harness before a crash reconciles it through the timeline; it never resubmits the turn under a new ID.
- **Accepted means started.** Success means the harness accepted the turn. Exactly one `turn-ended` event follows for it, unless the session ends first, in which case the turn ends as `interrupted` before `session-ended` when the plugin can observe it, and the host reconciles it otherwise.
- **Interruption.** `interrupt` names the running turn. The turn ends as `interrupted`. Interrupting a turn that is not running fails with `precondition-failed`. Whether interruption also stops a command the harness already started is a qualification result per harness; the host treats the turn's side effects as unknown until the turn has ended.

## 7. Native requests

### 7.1 Events

A native request is an event with the turn ID, a **native request ID**, and its text:

| Event | Capability | Text field | Response kind |
| --- | --- | --- | --- |
| `permission-request` | `permission-requests` | `summary`, what the harness asks to do | `permission`: `allow` or `deny`, with an optional message |
| `input-request` | `input-requests` | `prompt` | `input`: text |
| `delegation-request` | `delegation` | `instructions` for the child task | `delegation-result` (section 7.4) |

A native request ID is unique within its generation. The host keys a request by its session, generation, and native request ID, so a native ID that a later process reuses is a different request.

### 7.2 Classification

A `permission-request` may carry an `operation`, the plugin's classification of the native action into a harness-neutral operation. G3 defines one kind, `push`, with the full ref it pushes to (`refs/heads/...`). The plugin classifies a request only when the native action does exactly that and nothing else; a compound command, an unknown tool, or any doubt leaves it unclassified. The host maps a `push` to the task's own branch onto the standing rule operation `push-to-task-branch` ([product ports contract](product-ports.md) section 5); an unclassified request matches no standing rule and waits for a person.

### 7.3 A single response

`respond` answers one request: the native session ID, the generation, the native request ID, and the response.

- The first valid response is applied; a second one for the same request fails with `conflict` and changes nothing.
- A response whose kind does not match the request, or whose value is not one the port defines, fails with `invalid`.
- An unknown native request ID fails with `not-found`; so does a request of an earlier generation, which is never re-delivered or answered in a later one.
- A response at a generation other than the current one fails with `precondition-failed`.

After a restart, the host reconciles a request whose response it had not delivered as unresolved, and presents any new request of the resumed harness for a fresh decision. It never sends a stored answer to a new request, and it never answers by default ([architecture section 7](../architecture.md#durable-chat-turns-and-provider-approvals)). The Claude Code qualification observed that a pending request is not re-delivered after a crash and that the resumed harness may plan the same action again under a new request ID; this rule covers that behavior for every harness.

### 7.4 Delegation

A `delegation-request` asks for a child task. The host admits it as item 38 defines and returns the child's outcome as a response of kind `delegation-result`: the host's delegation ID, the outcome (`completed`, `rejected`, `failed`, or `cancelled`), and a summary. The native request ID is the correlation that returns the result to the parent attempt's request, and the single-response rule makes a redelivered result a `conflict` that changes nothing. When the parent's native request no longer exists, because the generation that asked has ended, the response fails with `not-found`, and the host delivers the outcome to the resumed session as a turn whose ID it derives from the delegation ID, so that the turn's own rule (section 6) delivers it once.

## 8. Terminal

`terminalProgram` returns, for a running session at its current generation, the program and working directory of an interactive terminal on that session: a non-empty `argv` and a `workingDirectory`. The host runs it in a pseudo-terminal inside the execution's process set, under the attempt's launch authorization and credentials (item 39). The program is only a description: the plugin starts nothing. For a session that has ended, or a generation that is not current, the call fails with `precondition-failed`, so a terminal attaches only to a running attempt's execution, and it is never recovered as a separate execution after a restart.

## 9. Outcomes and error mapping

### 9.1 Turn outcomes

Every turn ends with exactly one `turn-ended` event. The plugin maps every native result and every native exception or transport failure onto one outcome; when a harness reports an error result and also raises an error for the same turn, the plugin reports one outcome.

| Outcome | Meaning |
| --- | --- |
| `completed` | The harness finished the turn |
| `interrupted` | The turn was interrupted, or its session was closed while it ran |
| `turn-limit-reached` | The harness stopped at its own turn or budget limit |
| `account-limit-reached` | The harness stopped at a rate or usage limit of its account; a `limit` signal accompanies it when declared |
| `failed` | Anything else; the event carries a `failure` |

A `failed` turn carries exactly one failure, and no other outcome carries one:

| Failure | Meaning |
| --- | --- |
| `authentication` | The credential was rejected or expired |
| `transport` | The harness could not reach its provider |
| `harness-exited` | The harness process ended during the turn |
| `protocol` | The harness sent something the plugin could not map |
| `internal` | A plugin error |

### 9.2 Session end

`session-ended` carries a reason: `closed` after `closeSession`, `exited` when the harness ended on its own, and `failed` when it ended through an error. It may carry the exit code (0 to 255) or the signal name (`SIG...`) when the plugin observed them. The supervisor's exit observation of the execution stays the authority for process termination; this event is the harness's own view of its session.

### 9.3 Operation failures

| Code | When |
| --- | --- |
| `invalid` | A malformed request or response, a response of the wrong kind, an undeclared credential mechanism, or a generation that is not a positive integer |
| `not-found` | An unknown native session, or an unknown or expired native request |
| `conflict` | A second start of one session, a second subscriber, a repeated turn ID, or a second response |
| `precondition-failed` | A generation that is not current, an ended session, a turn already running, no running turn to interrupt, or a resume of a running session |
| `forbidden` | The harness rejected the credential while starting or resuming; the slot is then reported to the pool, as item 12 defines |
| `unavailable` | An undeclared capability, or a harness that cannot be started or reached |
| `internal` | A plugin error |

## 10. Conformance suite

`runAgentHarnessConformance(harness, fixture)` is the harness-neutral suite. It has no test runner: a plugin's tests call it with their own fixture and assert that the report has no findings, as the SDLC framework suite does. The fixture gives the working and state directories, the credential, a timeout, and the prompts that make the harness answer, ask for a permission once, run until interrupted, and, when declared, ask for input once and request a delegation once. The suite parses the declaration first and stops with a `capabilities` finding if it is invalid. It then runs these scenarios, each in its own session:

| Scenario | Checks |
| --- | --- |
| Chat with prompt correlation | Two turns complete under their turn IDs; a second subscriber, a repeated turn ID, and an unknown session are rejected; close ends the stream with `session-ended` `closed`, and a turn after close is rejected |
| Serialized turns and interruption | A second turn while one runs is rejected; interrupting the running turn ends it as `interrupted`; interrupting an idle or ended turn is rejected |
| Permission request with a single response | The request arrives with a native request ID; a stale generation is rejected; one deny is applied; a second response and an unknown request are rejected; the turn ends |
| Input request | One answer is applied and a second rejected (when declared) |
| Delegation result by correlation | One result is applied and a second rejected (when declared) |
| Resume without replaying a pending request | After close and resume, the earlier generation's pending request is `not-found`, the earlier generation is rejected, a turn ID of the earlier generation is a `conflict`, and a new turn completes (when declared) |
| Terminal only while the session runs | A running session returns a terminal program; after close the call is rejected (when declared) |

An undeclared optional capability's scenario is replaced by a check that its operation fails with `unavailable`. Throughout, every event is parsed and checked: an unknown turn ID, a reused native request ID within a generation, a second `turn-ended` for a turn, and any event after `session-ended` are findings. Each finding names its scenario and one check: `capabilities`, `fixture`, `threw`, `result`, `outcome`, `event`, `timeout`, or `undeclared-capability`.

`ScriptedAgentHarness` is the scripted test harness: an in-memory `AgentHarness` that plays a script of steps per prompt text (output, a permission, input, or delegation request, an account signal, waiting for an interruption, and a turn outcome). The Execution module's tests run the suite against it with every capability and with only the required ones, and run it against broken variants to show that each check reports its rule. Item 18 uses it to test the host without a real harness. It is a test double: no installation runs it.

## 11. Required tests

The items that implement this port add, through `make`:

- Item 19: the suite run against the first plugin with its pinned binary and a real slot credential, with no findings, on every platform the plugin pins; the egress test; the host side-effect check with before-and-after listings; and on macOS, a check that every process of a session stays in its process group.
- Item 18: host tests over the scripted harness that every event is parsed before use, a request is persisted before it is shown, a response is consumed once, an unresolved request after a restart is never answered automatically or replayed, a binary whose digest does not match is refused, and a `limit` signal leads to the handoff and the slot's cooldown; with the crash points of each path.
- Items 38 and 39: a delegation result delivered once across a redelivery and a restart, and a terminal refused for an ended session and never recovered after a restart.
- G4: the second harness passes the same suite before the port is frozen in the plugin SDK.

## 12. Not in this contract

- A real harness plugin (item 19 and G4), the harness host (item 18), and the account pool (items 5 and 12).
- The session timeline, turn idempotency keys, and stream retention (item 4), and the wire schemas (item 9).
- How the host reaches the plugin across the supervisor boundary (item 18).
- A generated egress test from a manifest's telemetry switch and destinations, which the Claude Code qualification proposes and leaves undecided.
- Freezing `AgentHarness` in the plugin SDK, which follows the second harness in G4.
