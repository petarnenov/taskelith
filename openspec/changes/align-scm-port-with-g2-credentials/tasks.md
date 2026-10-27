## 1. Change

- [x] 1.1 Create the change `align-scm-port-with-g2-credentials`, with empty `findings.jsonl` and `passes.jsonl`
- [x] 1.2 Update `docs/contracts/source-control.md` and the `scm-port` spec delta before the code

## 2. Findings

- [x] 2.1 H1: record the per-run secret's handling as a G3 obligation of items 20 and 21
- [x] 2.2 M1: name items 9, 26, and 37 for the webhook receiver's ingress and TLS
- [x] 2.3 H1b: findings without raw payloads, with tests that fail before the fix
- [x] 2.4 M1b: record refresh delivery as open G3 work with its owners (coordinator decision: option A), amending the G3 plan rows of items 9, 18, 20, and 21
- [x] 2.5 M2: record the Forgejo admission and compatibility gate, and document it in the credential cases
- [x] 2.6 L1: kernel and external identifier readers, with tests that fail before the fix

## 3. Evidence

- [x] 3.1 Integrations tests with coverage, build, boundaries, comments, links, findings, OpenSpec, and archive dry run
- [ ] 3.2 `make verify` (run by the coordinator)
- [x] 3.3 Record `verification.md`

## 4. Review and archive

- [x] 4.1 Independent review pass 1 (reviewer A) and its fixes
- [ ] 4.2 Independent review pass 2 (reviewer B) and pass 3 (reviewer A)
- [ ] 4.3 Archive the change
