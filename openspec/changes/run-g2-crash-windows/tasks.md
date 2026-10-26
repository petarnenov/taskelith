## 1. Harness composition

- [x] 1.1 Compose the real control plane and a real worker process per scenario against the `make` services, with their own database, data roots, and broker account
- [x] 1.2 Arm W1 to W6 through the journal's commit-point hook, CP1 to CP4, CP10, and CP12 at the supervision port, and CP5 to CP9 and CP11 in the supervisor program, without a product seam
- [x] 1.3 Check one durable outcome in the control plane and the journal, the spawns, and no leftover process

## 2. Scenarios

- [x] 2.1 A crash before and after each of W1 to W6, then a restart
- [x] 2.2 A crash at each of CP1 to CP12, then a restart of the worker
- [x] 2.3 Duplicate delivery of the offer during and after the execution
- [x] 2.4 Record every result in `results.jsonl` of this change

## 3. Records

- [x] 3.1 Evidence run on macOS x86_64 and `verification.md`
- [ ] 3.2 The product defect that fails eleven windows is decided and fixed in its own change, and the scenarios pass
- [ ] 3.3 `make verify`
- [ ] 3.4 Independent review
