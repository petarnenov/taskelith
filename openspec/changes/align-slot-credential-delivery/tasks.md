## 1. Change

- [x] 1.1 Create the change `align-slot-credential-delivery`, with empty `findings.jsonl` and `passes.jsonl`
- [x] 1.2 Update `docs/contracts/account-pool.md` and the `account-pool-port` spec delta before the code

## 2. Findings

- [x] 2.1 M5: deliver only `subscription-token` credentials and refuse `device-login` slots (coordinator decision: option (a), by D6)
- [x] 2.2 M6: keep the credential out of the worker journal, execution directories, logs, and the outbox, with a new delivery per execution
- [x] 2.3 M7: redaction by value in `@taskelith/secrets`, with tests that fail before the change
- [x] 2.4 L6: delivery only over item 26's TLS or to a co-located worker
- [x] 2.5 L7: `AccountSlots` in PostgreSQL, the `SlotCredentials` key or store in `control-plane/`
- [x] 2.6 L8: the delivery, not `SlotCredentials`, checks the reservation
- [x] 2.7 L9: one `REDACTED` in the kernel, with a test that fails before the change

## 3. Evidence

- [x] 3.1 Tests with coverage of the touched packages, build, boundaries, comments, links, findings, OpenSpec, and archive dry run
- [x] 3.2 `make verify` (in the coordinator's Docker slot, on `bf7c0335`)
- [x] 3.3 Record `verification.md`
- [x] 3.4 `make verify` again after the review pass 1 fixes (in the coordinator's Docker slot, on `b00cdde8`)

## 4. Review and archive

- [x] 4.1 Independent review pass 1 (reviewer A) and its fixes
- [x] 4.1.1 Keep removal draining or rejecting per ADR 0005 decision 6; only a revocation cancels (coordinator decision, Niki, 2026-10-27)
- [ ] 4.2 Independent review pass 2 (reviewer B) and its fixes
- [ ] 4.3 Independent review pass 3 (reviewer A)
- [ ] 4.4 Archive the change
