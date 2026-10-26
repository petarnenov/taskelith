## 1. Harness composition

- [x] 1.1 Compose the real control plane and a real worker process per scenario against the `make` services, with their own database, data roots, and broker account
- [x] 1.2 Arm W1 to W6, CP10 after W5s, and CP12 after W5e through the journal's commit-point hook, CP1 to CP4 at the supervision port, and CP5 to CP9 and CP11 in the supervisor program, without a product seam
- [x] 1.3 Check one durable outcome in the control plane and the journal, the spawns, and no leftover process

## 2. Scenarios

- [x] 2.1 A crash before and after each of W1 to W6, then a restart
- [x] 2.2 A crash at each of CP1 to CP12, then a restart of the worker
- [x] 2.3 Duplicate delivery of the offer during and after the execution
- [x] 2.4 Record every result in `results.jsonl` of this change

## 3. Records

- [x] 3.1 Evidence run on macOS x86_64 and `verification.md`
- [x] 3.2 Mark the eleven windows that fail on D1 as expected failures matched on D1's signature, still recorded `failed` (coordinator decision)
- [x] 3.3 Record D1 and O1 with the owner's delegate's decisions (away run `20261026T161148Z-opencode-90873`); D1's fix belongs to `fix-launch-recovery-reauthorization`, O1's to `fix-unclaimed-launch-liveness`
- [x] 3.4 Merge `origin/dev`, a final evidence run with seed `2776760789`, and `make verify`
- [ ] 3.5 Independent review: pass 1 (Codex CLI) found 0 Critical, 1 High, 7 Medium, 2 Low, all resolved; pass 2 pending
