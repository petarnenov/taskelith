## Context

Review B pass 2 of the G3 item 0 revalidation of item 5 (HEAD `b71f19ff`) found M5, M6, M7, L6, L7, L8, and L9 against the account pool contract. L3, L4, L5, L10, L11, and M1 to M4 of the same review belong to other tasks. G2 facts that the decisions rest on:

- The agent harness port names two subscription mechanisms: `subscription-token`, a long-lived token per slot, and `device-login`, a per-slot state that the session receives as its state directory (`/docs/contracts/agent-harness-port.md` section 4.1; `StartSessionRequest.stateDirectory`).
- G3 decision D6 (`/docs/g3-plan.md`, "Owner decisions"), decided by the owner on 2026-10-25: (a), a long-lived subscription token per slot, stored encrypted and injected per run, if item 35 confirms it; (b), a device login per slot, was not chosen. Items 19 and 35 depend on it.
- The worker journal holds launch authorization requests and grants (`/docs/contracts/worker-journal.md` section 1), commits a grant at W3 (section 5), and recovery after a W3 grant without W4 starts a new execution (section 5, recovery table).
- `@taskelith/secrets` matches only Taskelith's shapes and URL user information (`packages/adapters/secrets/src/scrub.ts`, `SECRET_SHAPE_RULES` of `@taskelith/observability`); a subscription token has none.
- G2 runs plain HTTP and NATS (`/docs/contracts/installation-and-enrollment.md` section 7); TLS is G3 item 26.
- The `control-plane/` namespace is a file subtree of `0600` files (`/docs/contracts/installation-and-enrollment.md` section 3); the G3 plan places encrypted credential storage there (`/docs/g3-plan.md`, item 12).
- `REDACTED` was defined twice, in `packages/modules/observability/src/domain/redaction-rules.ts` and `packages/modules/scheduling/src/domain/slot-secret.ts`, and both packages exported it.

## Decisions

1. **M5, option (a): subscription tokens only.** The contract delivers only `subscription-token` credentials. The add-slot command rejects a `device-login` slot with `invalid`, and the delivery reveals nothing for a slot of another mechanism, until a later item defines a state directory format and a compare-and-set write-back by the reserving run (sections 3.1, 7.1, and 10). Reason: D6 chose a subscription token per slot for Claude Code, the only harness G3 admits (item 19), and did not choose the device login, so no G3 item needs device-login delivery; defining a format and a write-back no harness uses would be unverifiable. The restriction is revisited only if item 35 overturns D6. Coordinator confirmation (Niki, 2026-10-27): option (a). `SlotSecret` stays one text; only its comment and the contract say it is a subscription token. The pool still treats `mechanismId` as opaque: the add-slot command and the delivery, both outside the pool's ports, compare it with `subscription-token`. This change makes no claim about provider terms for subscription tokens; D15 and ADR 0005 decision 2 are pending with the owner.
2. **M6, memory only, a new delivery per execution.** Section 7.3 keeps the credential in the worker host's memory for one execution and out of the journal, a grant, `worker/executions/<executionId>/`, `worker/logs/`, and the outbox. Every execution after W3, recovered or adopted, requests it again through a new delivery with the checks of section 7; an adopted execution needs it for redaction even when its harness already has it. No delivery or worker code exists yet, so the tests are obligations of item 18 in section 9, and the spec states them as scenarios.
3. **M7, redaction by value in `@taskelith/secrets`.** The SCM follow-up (`/openspec/changes/archive/2026-10-27-align-scm-port-with-g2-credentials/design.md`, decision 1) kept one redaction boundary: shapes join the shared `SECRET_SHAPE_RULES`, which both log redaction and `@taskelith/secrets` use. A slot token has no shape, so a shape rule cannot match it; the same boundary instead takes the run's revealed values. `redactSecrets(text, revealed)` and `redactFailure(failure, revealed)` replace each exact revealed text, longest first, with `REDACTED` before the shape rules; `revealed` defaults to none, so every existing caller keeps its behavior. Replacement uses `split` and `join`, which take linear time and need no pattern escaping; an empty value is ignored. The package takes plain strings, not `SlotSecret`, so it does not depend on Scheduling. Item 18 applies them to the run's harness output, logs, and failures (section 7.4). `scrubEnvironment` is unchanged: the plugin injects the credential on purpose.
4. **L6, transport.** Section 7.2: delivery only over item 26's TLS or to a worker co-located with the control plane on its host; a remote worker gets no slot credential before item 26.
5. **L7, storage.** Section 1: `AccountSlots` is in the installation's PostgreSQL database; the `SlotCredentials` key, or its whole store, is in the `control-plane/` namespace, never in the database. Section 6.2 now cites section 1 for that, instead of section 7.
6. **L8, the check belongs to the delivery.** `reveal` checks no reservation, attempt, or slot state; the delivery checks them in a capacity transaction and calls `reveal` after the commit (sections 6.2 and 7). The modified "Redacted slot credentials" says so; the port comment says so.
7. **L9, one constant in the kernel.** `REDACTED` moves to `@taskelith/kernel`, which every module already depends on. `@taskelith/observability` re-exports it, so its readers, `@taskelith/secrets` among them, are unchanged; `@taskelith/scheduling` imports it and no longer exports it.

## Plan checklist

Verbatim from the coordinator's brief:

```
Review checklist (capabilities account-pool-port, harness-account-pools; files docs/contracts/account-pool.md, packages/modules/scheduling/**, packages/adapters/secrets/**), most frequent finding categories first:
1. contract-drift (9) 2. naming (7) 3. docs (5) 4. redaction (3) 5. spec-wording (3) 6. concurrency-race (1)

Record quality (archived findings under openspec/changes/), most frequent finding categories first:
1. evidence-mismatch (38) 2. docs (36) 3. stale-citation (19) 4. spec-wording (15) 5. process (7) 6. contract-drift (6) 7. scope (5)
```
