## Why

The G3 item 0 revalidation (`revalidate-g3-foundations`) of item 5 (`define-account-pool-contract`), review B pass 2 on HEAD `b71f19ff`, found that the account pool contract, its `account-pool-port` requirements, and its port types promise a slot credential delivery that G2 cannot carry out as written: a credential modeled as one text although a `device-login` slot is a state directory that the harness updates (M5), no rule that keeps the credential out of the G2 worker journal or says how a recovered execution gets it again (M6), a secrecy guarantee without a mechanism for a token that has no known shape (M7), no confidential transport over G2's plain HTTP and NATS (L6), a storage location that puts the PostgreSQL slot records in the `control-plane/` file namespace (L7), a reservation check assigned to a port that cannot make it (L8), and a second `REDACTED` constant exported from a second package (L9). The coordinator (Niki) assigned this follow-up for those seven findings.

## What Changes

- `docs/contracts/account-pool.md`: delivery only of `subscription-token` credentials, with `device-login` slots refused until a later item defines their state directory and write-back (sections 3.1, 6.2, 7.1, and 10; M5); the credential only in the worker host's memory and never in the journal, an execution directory, logs, or the outbox, and a new delivery for every execution after W3, recovered or adopted ones included (rule 5, section 7.3; M6); redaction of the run by the credential's value (rule 5, section 7.4; M7); delivery only over item 26's TLS or to a co-located worker (section 7.2; L6); `AccountSlots` in PostgreSQL and the `SlotCredentials` key or store in the `control-plane/` namespace (sections 1 and 6.2; L7); the reservation check made by the delivery, not by `SlotCredentials` (sections 6.2 and 7; L8); the kernel's `REDACTED` (section 6.2; L9); rotation only on a revoked, unreserved slot, revocation that cancels the slot's in-flight attempts, and removal that drains or rejects them by ADR 0005 decision 6, neither blocked by a reservation (sections 8 and 8.1); re-delivery to an adopted execution by an ownership check (section 7.3); and the required tests (section 9).
- `docs/contracts/installation-and-enrollment.md` section 8: `@taskelith/secrets` also redacts revealed credentials by value.
- `account-pool-port`: modifies "Revocation, reinstatement, and removal" and "Redacted slot credentials"; adds "Subscription token delivery only", "Credential rotation only on an unreserved revoked slot", "Credential kept out of worker records", "Re-delivery to an adopted execution", "Run redaction by credential value", and "Confidential credential transport".
- `harness-account-pools`: modifies "Subscription account slots" so that only a deliverable mechanism, by D6 `subscription-token`, is accepted.
- `@taskelith/secrets` (private): `redactSecrets` and `redactFailure` take the credentials revealed to a run and redact each by its exact text, one marker per merged span, with the shapes they touch; `redactFailure` also redacts detail keys.
- `@taskelith/kernel` (private) defines `REDACTED`; `@taskelith/observability` re-exports it, and `@taskelith/scheduling` uses it and no longer exports its own.

## Capabilities

### New Capabilities

### Modified Capabilities

- `account-pool-port`: modifies "Revocation, reinstatement, and removal" and "Redacted slot credentials"; adds "Subscription token delivery only", "Credential rotation only on an unreserved revoked slot", "Credential kept out of worker records", "Re-delivery to an adopted execution", "Run redaction by credential value", and "Confidential credential transport".
- `harness-account-pools`: modifies "Subscription account slots".

## Impact

The account pool contract, section 8 of the installation and enrollment contract, the `account-pool-port` and `harness-account-pools` specs, and the private packages `@taskelith/kernel`, `@taskelith/observability`, `@taskelith/scheduling`, and `@taskelith/secrets`. The published `taskelith` package is unchanged. `@taskelith/scheduling` no longer exports `REDACTED`; its readers import it from `@taskelith/kernel`. Existing callers of `redactSecrets` keep their behavior, because the revealed values default to none; `redactFailure` now also redacts detail keys. No delivery path, add-slot, rotate, or revoke command, or worker code is implemented here: items 12 and 18 own them.
