## Context

`control-plane.openapi.json` 0.5.0 declares `listProjectAccountSlots`, `listAccountSlots`, `addAccountSlot`, `updateAccountSlot`, `revokeAccountSlot`, `reinstateAccountSlot`, `rotateSlotCredential`, and `removeAccountSlot` ([control-plane wire contracts](/docs/contracts/control-plane-wire-contracts.md) sections 4, 6, and 7). Sub-change 12d A gave `@taskelith/scheduling` the add, update, revoke, reinstate, remove, rotate, and sweep commands, each of which reads the stored revision itself; sub-change 12c gave the control plane `SlotCredentialDeliveryService`, which no composition builds, so `fetchSlotCredential` answers 503. The slot credential key is opened lazily by `openSlotCredentialKey`, which nothing calls, and the living requirement "SCM integration secret key at initialization" says initialization never creates it. The browser endpoint drops only the `confidential` routes, so it still serves `enrollWorker` and the worker credential operations.

## Goals / Non-Goals

Goals: the eight operations exactly as the document states them, with the roles of `access-requirements.ts`; compare-and-set on the client's revision; no credential in any answer, failure, or log record, and `Cache-Control: no-store` on every answer; the account pool contract section 7.1 limit of one Claude Code slot over HTTP; the composed key, credential store, admitted pair, delivery, sweep loop, and default cooldown; and a browser endpoint without worker-only routes.

Non-goals: the slot rejecting reasons on the wire (B2), an audit of the slot commands, key rotation (12d C, 12f), load and health signals (12e), and the screen (33c).

## Decisions

The coordinator (Niki) decided Q1 to Q12 on 2026-11-05; each decision below names its question.

1. **OpenAPI descriptions (Q1).** Four response descriptions of 0.5.0 contradicted the 12d A decisions and are corrected in place, with no schema change: the 409 of `revokeAccountSlot` and `reinstateAccountSlot` names only the moved revision, and says that a repeat at the current revision answers 200 unchanged; the 409 of `removeAccountSlot` says that a removed slot answers 404; the 200 of `rotateSlotCredential` returns the slot as its switch committed it; and the 409 of `updateAccountSlot` names a revoked slot. A description is no breaking change for `oasdiff`, so `make contract-compatibility` needs no version bump and the version stays 0.5.0, which is not on `main` yet. The generated web types drop descriptions, so they do not change. `slot-command-descriptions.test.ts` in `@taskelith/contracts` pins the four texts.
2. **Wire rejecting reasons (Q2, Q12).** Not in B1: B2 adds them with OpenAPI 0.6.0 after B1.
3. **Revision first (Q3).** Every slot command takes `expectedRevision`. After the read that answers `not-found` for a removed or unknown slot, a stored revision other than `expectedRevision` is `conflict`, before any state rule: a repeated revocation or reinstatement, and an update that changes nothing, answer 200 unchanged only at the current revision. A rotation compares before it stores, so a stale rotation leaves no orphan version.
4. **Listing (Q4).** `AccountSlots.list(after, limit)` returns every slot, removed tombstones included, and `listForProject(projectId, after, limit)` the active slots that allow the project, of any harness; both order by identifier in code-unit order and start after `after`. The service reads one more than the page of 100 to name `next`, as `ProjectSetupService` does.
5. **Unknown projects (Q5).** `addAccountSlot` and an `updateAccountSlot` that names `allowedProjects` read each project through `ProjectSetupService.readProject`; an unknown one answers 400 `invalid` with `details.field` `allowedProjects`, before any credential is stored.
6. **Audit (Q6).** No audit is written; see "Limitations".
7. **Default cooldown (Q7).** `TASKELITH_SLOT_DEFAULT_COOLDOWN_MINUTES` is read at start: unset or empty is the provisional 60, a decimal whole number from 1 to 1440 is taken, anything else refuses the start naming the variable. The composition passes the value to `SlotSignals`, whose `applyLimit` calls `applySlotLimitInTransaction` with it; item 18 is its first caller, and `account-pool-composition.test.ts` checks that the value reaches the cooldown.
8. **Sweep loop (Q8).** The composition runs `sweepSlotCredentials` with the least grace age every `SLOT_CREDENTIAL_SWEEP_MILLISECONDS` (one hour), or the test setting `slotCredentialSweepMilliseconds`, supervised like the other loops; a sweep that fails or rejects is logged as `scheduling.slot-credentials.sweep-failed` and never stops the service.
9. **Key (Q9).** `SlotCredentialKeyFile` extends `ControlPlaneKeyFile` with the file `slot-credential-key` and refuses a key that is not 32 bytes, naming the file and the size but no key byte. Initialization ensures it, also on a rerun; the start only reads it and refuses without it, naming `init`. `openSlotCredentialKey` and its lazy creation are removed. The `control-plane-api` delta MODIFIES "SCM integration secret key at initialization" to drop "never the slot credential key".
10. **Slot identifiers (Q10).** `RandomIdentifiers.newSlotId()` mints `s` and 32 hexadecimal digits (wire section 6). A minted identifier that is already stored is the server's fault: the add answers 500 `internal` with a fixed message, as the enrollment token commands do.
11. **Browser endpoint (Q11).** `browserEndpointRoutes` keeps every route that is neither `confidential` nor worker-only, and a route is worker-only when every alternative of its `security` is `workerCredential` or `enrollmentToken`; `workerEndpointRoutes` keeps every route that is not `browserOnly`. The composition uses both, and `endpoint-routes.test.ts` checks them over `ROUTES`.
12. **Admitted pair.** The composition keeps `CLAUDE_CODE_HARNESS_ID` (`claude-code`) and one admitted pair, `subscription-token` with slot limit 1 (account pool contract section 7.1); `device-login` and every other harness answer 400.
13. **Write-only bodies.** `addAccountSlot` and `rotateSlotCredential` set `writeOnlyBody`, so a refused body's failure names only the fields at fault. The handlers turn the credential into a `SlotSecret` at once, and every wire body is mapped field by field from the record, so `credentialVersion` never leaves.
14. **Revocation command identifier.** The end command of a holder's assignment is `v` and the SHA-256 of the assignment identifier and `slot-revocation`, so a rerun sends the same command and it differs from a worker revocation's.

## Departures

- The research note expected an empty `TASKELITH_SLOT_DEFAULT_COOLDOWN_MINUTES` to refuse the start; it takes the default instead, as every other variable of `settings.ts` treats an empty value as unset.
- The composed `fetchSlotCredential` is shown wired by a 422 refusal of an unreserved slot instead of a delivery: no placement reserves a slot until item 18 passes a slot request, and `slot-credential-delivery.integration.test.ts` covers the delivery over PostgreSQL.

## Limitations

- **Audit (Q6).** Account pool contract section 8 says each command is audited with its actor and time; B1 writes no audit record, because that needs a table and a migration. A follow-up change adds it, as 11b2 did for the SCM integrations.
- **Rotation answer.** The rotation answers the slot at its switch revision, and its cleanup then advances the revision once more, so a client reads the slot again before its next command.
- **Signals.** `SlotSignals` has no caller until item 18 relays the limit signals.

## Risks / Trade-offs

- Every slot command now needs the client's revision, so the scheduling tests and the PostgreSQL command tests pass the current one.
- A browser that loses a command's answer reads the slot again, because a repeat with the stale revision answers 409.
