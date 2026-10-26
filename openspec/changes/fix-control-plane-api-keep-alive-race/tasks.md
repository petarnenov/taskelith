## 1. Control plane

- [x] 1.1 `createApiServer` answers every request with `Connection: close` (decision 1)

## 2. Tests

- [x] 2.1 Unit test: two sequential requests open two connections and each answer carries `connection: close`; it fails before the fix (decision 2)
- [x] 2.2 Check that nothing relies on connection reuse with this server; run the control-plane and `worker-control-plane-client` tests

## 3. Verification

- [x] 3.1 `openspec validate --strict` and `make verify`
- [x] 3.2 Independent review (pass 1, Low-only; fixes unreviewed)
