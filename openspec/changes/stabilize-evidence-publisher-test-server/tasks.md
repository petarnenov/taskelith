## 1. Test server

- [x] 1.1 Add a regression test in which a client leaves mid-body, and record that it fails before the fix.
- [x] 1.2 Make the fake server's handler total and close all connections in `after`.

## 2. Verification and review

- [x] 2.1 Run the test file repeatedly, idle and under parallel load, and run `make verify` and the OpenSpec strict validation.
- [ ] 2.2 Obtain independent review and record the results.
