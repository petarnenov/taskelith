## 1. Analysis

- [x] 1.1 Measure every rule of the logger and the secrets adapter at 20,000, 40,000, and 80,000 characters
- [x] 1.2 Check that observability may depend on access without a cycle (Q2)

## 2. Tests

- [x] 2.1 `assertLinearOnRuns` in `@taskelith/testing` with its tests
- [x] 2.2 Logger: secret shapes redacted in fields and correlation, and linear time, failing on the base code
- [x] 2.3 Secrets adapter: linear time, failing on the base code, and the creds block without an end and empty user information

## 3. Implementation

- [x] 3.1 Move `SECRET_PREFIXES` to `@taskelith/access` and re-export it from the secrets adapter
- [x] 3.2 Shared rules, vocabularies, and `REDACTED` in `domain/redaction-rules.ts`; the logger gains the secret shapes
- [x] 3.3 The secrets adapter and the failure cause compose the shared rules
- [x] 3.4 Compare old and new output per caller, exhaustively and randomly
- [x] 3.5 Regenerate the dependency inventory

## 4. Records

- [x] 4.1 Proposal, design, the `execution-observability` delta, `verification.md`, and an empty `findings.jsonl`
- [x] 4.2 `npm run openspec -- validate centralize-log-redaction-rules --strict` and a scratch archive
- [x] 4.3 `make verify` on `9f7972f3`: passed
- [x] 4.4 Independent review pass 1 (OpenCode `opencode-go/kimi-k2.7-code`): 1 Low, declined; Low-only, no further pass
