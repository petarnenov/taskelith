## 1. Contracts

- [x] 1.1 Verify at `b87abe75` the lines that the deferred findings cite, the harness port signal types, the pool's slot types, the code-unit order, and the G2 and G3 plan items.
- [x] 1.2 Drop the reset signal from the account pool contract; a cooldown ends only at its stored end (pass 1 M2, pass 2 L12).
- [x] 1.3 Derive the usage window end in the pool from the applied report and a per-harness window length; skip the tie-breaker for an unknown or ended window, in sections 3.1, 4.2, 5, and 9 (pass 1 M1, pass 2 L13).
- [x] 1.4 Take mechanisms from the admitted pairs and health from session failures, never from a plugin query outside a session (pass 2 M4), and apply each signal to the slot of the attempt's reservation (pass 2 L5).
- [x] 1.5 State the after-limit wait under the G2 fair order and backoff (pass 1 L1), code-unit order (pass 2 L10), and the current status (pass 2 L11).
- [x] 1.6 Give the per-session attempt invariant to G3 item 4 in capacity reservation section 10 (pass 1 L2).
- [x] 1.7 Replace the reset signal wording in `docs/architecture.md`.

## 2. Specifications

- [x] 2.1 Modify `account-pool-port` "Deterministic least-loaded order", "Cooldown bounds", and "Slot store compare-and-set", and add "Session reports applied to the reserving slot", "Usage window derived by the pool", and "Health from session failures".
- [x] 2.2 Modify `harness-account-pools` "Least-loaded selection with cooldown".

## 3. Verification and review

- [x] 3.1 Run strict validation of this change and of all, `make findings ARGS="validate"`, and `make verify`, and record them in `verification.md`.
- [x] 3.2 Review pass 1 by reviewer A (Codex `gpt-6.1-sol`, effort medium), recorded in `verification.md`, `passes.jsonl`, and `findings.jsonl`.
- [x] 3.3 Review pass 2 by reviewer B, unless pass 1 is Low-only: not run, pass 1 was Low-only.
- [x] 3.4 Review pass 3 by reviewer A, if pass 2 leaves fixes to confirm: not run, no pass 2.

## 4. Review pass 1

- [x] 4.1 Fix the three pass 1 Low findings without another review: the ASCII qualifier of the collation order, the derived window risk, and the recorded reset signal grep.

## 5. Archive

- [x] 5.1 Archive the change in the last commit of the branch and record the archive checks.
