## 1. Contract

- [x] 1.1 Add `maximum: 2147483647` to `slots`, `cpuMillicores`, and `memoryMebibytes` of `WorkerCapacity` in both execution documents.
- [x] 1.2 Run `make contract-compatibility`, record its classification, and raise the document versions it requires; update the contract page.
- [x] 1.3 Remove the enrollment handler's hand check and `MAX_CAPACITY_VALUE`.
- [x] 1.4 Add a contract test for the bound in both documents.
- [x] 1.5 Add the spec deltas.

## 2. Verification

- [x] 2.1 Show that the new test fails without the bound and passes with it.
- [x] 2.2 Run `make verify` on the Linux host.
- [x] 2.3 Pass the independent review and record it in `verification.md`.
