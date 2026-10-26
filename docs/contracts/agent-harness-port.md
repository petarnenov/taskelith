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
2. **Plain data.** The port exchanges plain data with string, number, and boolean fields, as the frozen SDLC framework port does ([ADR 0009](../decisions/0009-frozen-sdlc-framework-port.md)). Plugin output is untrusted: the host parses the capability declaration with `parseAgentHarnessCapabilities`, every operation result with `parseOperationResult`, and every event with `parseHarnessEvent`. They accept own data properties of plain objects and arrays only, and reject an unknown field, a missing field, an unknown value, or an accessor as `invalid`; a result must be exactly a kernel `Result`, with a kernel failure code and string details. These checks reject malformed shapes; they are not isolation, since a proxy's traps still run plugin code, and in-process plugins are trusted code (architecture section 7). Values are bounded as the table after these rules sets out, in both directions: the parsers reject plugin data outside a bound as `invalid`, and a plugin rejects a host request outside one as `invalid`. A plugin splits output longer than an event's text bound into several events.
3. **Results, never throws.** Every operation returns a kernel `Result`. An operation that throws, or returns anything other than a `Result`, breaks the contract. The failure codes are those of section 9.3. A malformed request, whether it is not an object, lacks a field, or has a field of the wrong type or outside its bound, fails with `invalid` before any session state is checked, so it is never reported as unknown or stale; only the `unavailable` of an undeclared capability (section 3) comes before it.
4. **Credentials.** The slot credential reaches the plugin only in the start or resume request of the run that reserved the slot (ADR 0005 decision 6). It never enters an event, a failure message or detail, a log, a prompt, or a terminal program.
5. **Generations.** A session's **generation** counts its native processes. The host starts a session at generation 1 exactly, and resumes it at exactly the generation after its last one: a start at another generation fails with `invalid`, and a resume at another one fails with `precondition-failed`. Every later request names the generation it was made for; a request for a generation other than the session's current one fails with `precondition-failed`, so a response, a turn, or an interrupt meant for an earlier process is never applied to a later one.
6. **Ordering and persistence are the host's.** The plugin reports what happened. The host persists each request before it is shown, consumes each response once in its journal, and reconciles after a restart ([architecture section 7](../architecture.md#durable-chat-turns-and-provider-approvals)); G3 item 4 defines the session timeline that records them.

| Value | Bound |
| --- | --- |
| Labels: `sessionId`, `nativeSessionId`, turn ID, `nativeRequestId`, delegation ID, and a pinned binary's `version` | 1 to 128 characters |
| Paths: `binaryPath`, the working and state directories of a request, a pinned binary's `path`, and a terminal program's `workingDirectory` | 1 to 1,024 characters |
| A terminal program's `argv` element and a classified operation's `ref` | At most 1,024 characters |
| Free text of an event (`text`, `summary`, `prompt`, `instructions`) and of a response (`message`, `text`, `summary`) | At most 65,536 characters (`MAX_HARNESS_TEXT_LENGTH`) |
| A failure's `message` and `details` | A message of at most 4,096 characters; details hold strings only |
| `usage` | A number from 0 to 1 |
| `exitCode` and `signal` of `session-ended` | An integer from 0 to 255; `SIG` followed by 1 to 16 uppercase letters or digits |
| `resetsAt` | A UTC instant `YYYY-MM-DDTHH:MM:SS` with an optional fraction of 1 to 9 digits and a final `Z`, naming a real calendar date and time; an offset such as `+00:00` is rejected |
| `sha256` | 64 lowercase hex digits |

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
| `reset-time` | `resetsAt` on a `limit` event, a UTC instant in the form section 2 sets | The end of the cooldown; without it, a bounded default applies |

`reset-time` requires `limit`. A plugin that reports no signals declares none; the pool then counts active sessions and applies the default cooldown (ADR 0005 risks). A turn stopped by an account limit ends as `account-limit-reached` (section 9); the host then writes the session's handoff and stops it, and its work continues in a new session as ADR 0005 decision 4 sets out. Selection, cooldown, and handoff are items 5, 12, and 18, not this port.

### 4.2 Pinned binaries and self-update

`binaries` pins one harness binary per supported platform: the platform, the exact version, the binary's `path` inside the plugin's installed package (relative, without `.` or `..` segments), and the SHA-256 digest of the binary, 64 lowercase hex digits. The platforms are `linux-x64`, `linux-arm64`, `darwin-x64`, and `darwin-arm64`, each at most once; a platform without a pinned binary is not supported. Obligations:

- The host resolves the worker platform's `path` inside the installed plugin package, verifies the file's digest against the declaration, and refuses a mismatch. It then passes the verified file's absolute path as `binaryPath` in every start and resume request, and the plugin runs exactly that file, never another one found on the host. Item 18 keeps the verified file unchanged between the check and the start, for example in the read-only worker image.
- The plugin disables the harness's self-update in every session it starts. A harness that cannot disable it is not admitted.
- A harness run writes only inside the session's working directory, its state directory, and the execution's temporary directory. The harness qualification checks this with before-and-after listings, as the `harness-qualification` specification requires.
- An upgrade is a new pinned version, a new declaration, and a new qualification run.

### 4.3 Process group on macOS

On macOS the supervisor's termination evidence rests on the child's process group ([supervisor identity contract](supervisor-identity.md) section 8). A plugin may pin a `darwin-*` binary only when the harness qualification shows that every process the harness starts stays in its process group; a harness that does not is not supported on macOS. The plugin itself never starts a process in a new session or process group. The terminal program of section 8 is the one exception, and the host, not the plugin, starts it: on macOS the host offers it only under the conditions section 8 sets.

## 5. Sessions

| Operation | Request | Result |
| --- | --- | --- |
| `startSession` | The host's `sessionId`, generation 1, the verified `binaryPath`, the working directory, the state directory, and the slot credential | The native session ID |
| `resumeSession` | As start, with the native session ID and the next generation | The same native session ID |
| `events` | The native session ID and generation | An async iterable of the generation's events |
| `closeSession` | The native session ID and generation | Nothing |

- **Start.** A start with a `sessionId` the plugin already started fails with `conflict`. A start at a generation other than 1, or at a generation that is not a positive integer, fails with `invalid`.
- **Events.** Each generation has one subscriber: a second `events` call fails with `conflict`. The stream ends right after the generation's `session-ended` event, which comes exactly once and last.
- **Close.** Closing stops the harness and its processes, ends a running turn as `interrupted`, and ends the stream with `session-ended` of reason `closed`. After close, every operation of that generation fails with `precondition-failed`, except a repeated `closeSession`, which succeeds and changes nothing, as does closing a session that ended on its own at its generation; the session can then only resume at the next generation.
- **Resume.** Only an ended session resumes, at exactly the generation after its last one; otherwise the resume fails with `precondition-failed`. A resume of a running generation fails at once, even when a close follows it, so a resume and a close never interleave. A resume that arrives after the end of the last generation has begun waits for that end to finish and is then checked again, so of concurrent resumes only one succeeds, and nothing of the earlier generation reaches the new one. A resumed session keeps its native session ID and its history, including the turn IDs it has seen. A native request that was pending when the earlier process ended does not survive into the new generation: a response to it fails with `not-found` (section 7.3).
- **Unknown session.** A native session ID the plugin does not know fails with `not-found` in every operation that names one, `resumeSession` included.
- **Host restart.** The port is called inside the execution, and its single subscriber is the host's relay there. How a restarted worker service reconnects to that relay, with its own cursor, is item 18's. A host that loses the relay and cannot reconnect never subscribes a second time: it closes the generation, or the supervisor ends the execution, and the session resumes at the next generation, so no turn or response is replayed.

## 6. Turns and prompt correlation

`submitTurn` sends one user turn: the native session ID, the generation, a **turn ID**, and the text. The host generates the turn ID, and it is the turn's immutable identity in the session timeline (item 4). The plugin maps it to its harness's native correlation field and maps each native event back to it, so that every `output`, request, and `turn-ended` event names the turn it belongs to.

- **One turn at a time.** Turns are serialized: submitting while a turn runs fails with `precondition-failed`. No harness declares concurrent turns in G3.
- **No second submission.** A turn ID the native session has seen, in any generation, fails with `conflict` and is not sent again. A host that cannot tell whether a turn reached the harness before a crash reconciles it through the timeline; it never resubmits the turn under a new ID.
- **Accepted means started.** Success means the harness accepted the turn. Exactly one `turn-ended` event follows for it before `session-ended`: `interrupted` when the session is closed, and `failed` with `harness-exited` when the harness process ends during the turn. Only when the plugin itself is lost with the process, so that nothing can be observed, does the host reconcile the turn without an event.
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
- A response of an unknown kind fails with `invalid`; a known kind whose capability is undeclared fails with `unavailable` (section 3).
- A response whose kind does not match the request, or whose fields are not those the port defines, fails with `invalid`. A `permission` response has `kind`, `decision`, and an optional `message`; an `input` response has `kind` and `text`; a `delegation-result` has `kind`, `delegationId`, `outcome`, and `summary`. Any other field is malformed. The delegation ID is 1 to 128 characters, and `message`, `text`, and `summary` are at most 65,536 characters (`MAX_HARNESS_TEXT_LENGTH`).
- An unknown native request ID fails with `not-found`; so does a request of an earlier generation, which is never re-delivered or answered in a later one.
- A request expires when its turn ends, whatever the outcome, and when its generation ends. A response to an expired request that was never answered fails with `not-found` and is not applied; a second response to an answered request still fails with `conflict`.
- A response at a generation other than the current one fails with `precondition-failed`.

After a restart, the host reconciles a request whose response it had not delivered as unresolved, and presents any new request of the resumed harness for a fresh decision. It never sends a stored answer to a new request, and it never answers by default ([architecture section 7](../architecture.md#durable-chat-turns-and-provider-approvals)). The Claude Code qualification observed that a pending request is not re-delivered after a crash and that the resumed harness may plan the same action again under a new request ID; this rule covers that behavior for every harness.

### 7.4 Delegation

A `delegation-request` asks for a child task. The host admits it as item 38 defines and returns the child's outcome as a response of kind `delegation-result`: the host's delegation ID, the outcome (`completed`, `rejected`, `failed`, or `cancelled`), and a summary. The native request ID is the correlation that returns the result to the parent attempt's request, and the single-response rule makes a redelivered result a `conflict` that changes nothing. When the parent's native request no longer exists, because the generation that asked has ended, the response fails with `not-found`, and the host delivers the outcome to the resumed session as a turn whose ID it derives from the delegation ID, so that the turn's own rule (section 6) delivers it once.

## 8. Terminal

`terminalProgram` returns, for a running session at its current generation, the program and working directory of an interactive terminal on that session: a non-empty `argv` and a `workingDirectory`. The host runs it in a pseudo-terminal inside the execution's process set, under the attempt's launch authorization and credentials (item 39). The program is only a description: the plugin starts nothing. For a session that has ended, or a generation that is not current, the call fails with `precondition-failed`, so a terminal attaches only to a running attempt's execution, and it is never recovered as a separate execution after a restart.

A program under a pseudo-terminal runs in its own session and process group, so it leaves the execution's process group. On Linux the execution's cgroup containment covers it. On macOS, where the supervisor's termination evidence rests on that process group (section 4.3), the host offers a terminal only once item 39 extends the [supervisor identity contract](supervisor-identity.md) to record, signal, and prove the end of the terminal's process group as part of the execution's process set. Until then, `terminal` is not offered on macOS.

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
| `invalid` | A malformed request or response, a label or path outside its bound (section 2), a response of an unknown or the wrong kind, an undeclared credential mechanism, an empty binary path, a generation that is not a positive integer, or a start at a generation other than 1 |
| `not-found` | An unknown native session, or an unknown or expired native request |
| `conflict` | A second start of one session, a second subscriber, a repeated turn ID, or a second response |
| `precondition-failed` | A generation that is not current, an ended session, a turn already running, no running turn to interrupt, a resume of a running session, or a resume at a generation other than the next one |
| `forbidden` | The harness rejected the credential while starting or resuming; the slot is then reported to the pool, as item 12 defines |
| `unavailable` | An undeclared capability, or a harness that cannot be started or reached |
| `internal` | A plugin error |

## 10. Conformance suite

`runAgentHarnessConformance(harness, fixture)` is the harness-neutral suite. It has no test runner: a plugin's tests call it with their own fixture and assert that the report has no findings, as the SDLC framework suite does. The fixture gives:

- the working and state directories, the verified binary path, and the credential;
- prompts that make the harness state a fact (`remember`) and repeat it (`recall`), with the text the recall must contain (`recalled`); ask for one permission for an observable action (`permission`); and run until interrupted (`longRunning`);
- when declared, a prompt that asks for input once and one that asks for one delegation, each repeating in its output the answer or the delegation result it receives;
- optionally, prompts that reach the harness's turn limit and its account limit, where the plugin's test can reproduce them;
- two probes: `actionRuns`, how often the permission prompt's action has run, and `endHarness`, which ends the harness process from outside, as a crash would;
- a timeout from 1 to 600,000 ms, 5,000 by default, which bounds every operation, every probe, and every wait for an event as a whole.

The suite parses the declaration first and stops with a `capabilities` finding if it is invalid, or with a `fixture` finding if the timeout is out of range or `recalled` is blank, since a blank text is in every output. It then runs these scenarios, each in its own session:

| Scenario | Checks |
| --- | --- |
| Chat with prompt correlation | `remember` and `recall` complete under their turn IDs, and the recall contains the fact; a second subscriber, a repeated turn ID, and an unknown session are rejected; close ends the stream with `session-ended` `closed`, and a turn after close is rejected |
| Serialized turns and interruption | A second turn while one runs is rejected; interrupting the running turn ends it as `interrupted`; interrupting an idle or ended turn is rejected |
| Permission request with a single response | Two requests in one generation have distinct native request IDs; a stale generation, an unknown response kind, a malformed decision, and an extra response field are rejected; a deny is applied once and its action does not run; a second response and an unknown request are rejected; an allow runs the action exactly once; a response to the request of a turn interrupted before its answer is `not-found` and runs no action |
| Exit observation | Ending the harness during a turn ends the turn as `failed` with `harness-exited`, then the session as `exited` or `failed`, and a later turn is rejected |
| Turn and account limits | When the fixture gives the prompts: the turn ends as `turn-limit-reached`, or as `account-limit-reached` with a `limit` signal when declared |
| Input request | An extra field, a response of the wrong kind, and a malformed text are rejected; then one answer is applied and reaches the harness's output; a second is rejected (when declared) |
| Delegation result by correlation | One turn per outcome (`completed`, `rejected`, `failed`, `cancelled`), each with its own delegation ID and summary: an extra field, a response of the wrong kind, and a malformed outcome are rejected; each result is applied once, and its turn's output contains its own delegation ID, outcome, and summary; a second is rejected (when declared) |
| Resume without replaying a pending request | After close and resume, the earlier generation's pending request is `not-found`; a turn, `events`, `interrupt`, `closeSession`, and, when declared, `terminalProgram` at the earlier generation are rejected with `precondition-failed`; a turn ID of the earlier generation is a `conflict`, no event names a turn of the earlier generation, and a recall in the new generation still contains the fact (when declared) |
| Terminal only while the session runs | A running session returns a terminal program; after close the call is rejected (when declared) |
| Session and request rules | A start at generation 2, 0, or 1.5, with an undeclared credential mechanism, or with an empty binary path is `invalid`, and a second start of the session is a `conflict`; `events`, `interrupt`, `respond`, `closeSession`, and, when declared, `terminalProgram` and `resumeSession` for an unknown session are `not-found`; each of them but `resumeSession`, and `submitTurn`, at generation 0 or 1.5 is `invalid`; a resume of the running session is `precondition-failed`. After the harness exits, `closeSession` succeeds; when `resume` is declared, a resume that skips a generation is `precondition-failed`, one at generation 0 is `invalid`, and one at the next generation succeeds |

An undeclared optional capability's scenario is replaced by a check that its operation fails with `unavailable`. Throughout, every result and event is parsed and checked: an unknown turn ID, a turn of an earlier generation, a reused native request ID within a generation, a second `turn-ended` for a turn, a turn without `turn-ended` before `session-ended`, a closed session's running turn that does not end as `interrupted`, any event after `session-ended`, and an iterator result that is not an object with an optional boolean `done` are findings. An ID the suite uses for an unknown session or request is one the harness has not issued in the run, so a harness may choose any native IDs. An event wait is bounded by the clock as well as by a timer, so a stream whose reads resolve at once without a matching event still times out; a read that times out abandons the stream, so no later read overlaps it. Each scenario ends with a cleanup that adds no findings: it abandons the stream and, for a session the scenario left open and that has not ended, makes a best-effort `closeSession` under the deadline, and calls the fixture's `endHarness` when that close does not succeed. Each finding names its scenario and one check: `capabilities`, `fixture`, `threw`, `result`, `outcome`, `event`, `timeout`, or `undeclared-capability`.

`ScriptedAgentHarness` is the scripted test harness: an in-memory `AgentHarness` that plays a script of steps per prompt text (output, a permission, input, or delegation request, an account signal, waiting for an interruption, and a turn outcome). An allowed permission counts as its action (`actionRuns`), an input or delegation answer is echoed as output, split like any long output, and `exitHarness` simulates the end of the native process. The Execution module's tests run the suite against it with every capability and with only the required ones, and against broken variants to show that each check reports its rule. Item 18 uses it to test the host without a real harness. It is a test double: no installation runs it.

## 11. Required tests

The items that implement this port add, through `make`:

- Item 19: the suite run against the first plugin with its pinned binary and a real slot credential, with no findings, on every platform the plugin pins, with the limit prompts wherever the harness can reach its limits on purpose; the egress test; the host side-effect check with before-and-after listings; and on macOS, a check that every process of a session stays in its process group.
- Item 18: host tests over the scripted harness that every event is parsed before use, a request is persisted before it is shown, a response is consumed once, an unresolved request after a restart is never answered automatically or replayed, a binary whose digest does not match is refused, and a `limit` signal leads to the handoff and the slot's cooldown; with the crash points of each path.
- Items 38 and 39: a delegation result delivered once across a redelivery and a restart, and a terminal refused for an ended session and never recovered after a restart.
- Item 39: on macOS, before `terminal` is offered there, the supervisor identity contract extended to the terminal's process group, with tests that the supervisor records it, signals it, and proves its end as part of the execution's process set; until then, a test that the host offers no terminal on macOS.
- G4: the second harness passes the same suite before the port is frozen in the plugin SDK.

## 12. Not in this contract

- A real harness plugin (item 19 and G4), the harness host (item 18), and the account pool (items 5 and 12).
- The session timeline, turn idempotency keys, and stream retention (item 4), and the wire schemas (item 9).
- How the host reaches the plugin across the supervisor boundary (item 18).
- A generated egress test from a manifest's telemetry switch and destinations, which the Claude Code qualification proposes and leaves undecided.
- Freezing `AgentHarness` in the plugin SDK, which follows the second harness in G4.
