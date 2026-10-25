## 1. Contract

- [x] 1.1 Add `maximum: 2147483647` to `cpuMillicores` and `memoryMebibytes` of `ResourceRequest` in the execution AsyncAPI document, and check that no other document defines it.
- [x] 1.2 Run `make contract-compatibility`, record its classification, and raise the document version it requires; update the contract page.
- [x] 1.3 Look for a hand check that the bound makes redundant (none found).
- [x] 1.4 Add a contract test for the bound in the assignment offer.
- [x] 1.5 Add the spec delta.

## 2. Verification

- [x] 2.1 Show that the new test fails without the bound and passes with it.
- [ ] 2.2 Run `make verify` on the Linux host.
- [ ] 2.3 Pass the independent review and record it in `verification.md`.
