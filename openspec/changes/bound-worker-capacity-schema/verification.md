# Verification: bound-worker-capacity-schema

## Scope and source

Assigned by the coordinator (Niki) on 2026-10-25 to the worker Ziki, as a contract follow-up of G2 item 16. Base revision: `c84ca71` on `dev`. Scope: `WorkerCapacity` in both execution documents and their versions, the enrollment handler's hand check, a contract test, the contract page, the spec deltas, and this change. Prepared in the git worktree `../taskelith-worktrees/bound-worker-capacity-schema` on branch `bound-worker-capacity-schema`. The published package is unchanged, so the commit type is `chore`.

## Environment

Ubuntu 24.04.5 LTS, Linux 6.8.0-147-generic, x86_64; Node.js v24.22.1 and npm 12.2.1 through nvm; Docker Engine 27.3.1, Compose v2.29.7.

## Author self-check before review

- The bound matches the `integer` columns `slots`, `cpu_millicores`, and `memory_mebibytes` of the `workers` table. The capacity contract sets no tighter bound for declared capacity; its per-attempt ceilings apply to `ResourceRequest`, which this change leaves alone.
- The schema validation runs before the handler in `answerRoute`, and the `enrollmentToken` scheme presents no token before the handler, so removing the hand check keeps a refused request from consuming the token. The integration test in `apps/control-plane/test/control-plane-api.integration.test.ts` sends `2147483648` and then enrolls with the same token.
- `WorkerCapacity` is identical in both documents after the change; the package's shared-name check passes in the build.
- The generated contract types do not change: a maximum does not change the TypeScript type.
- Evidence check: the change adds no external link or external evidence.

## Checks

- `make contract-compatibility` with the maximums and the old versions failed: `execution.openapi.json` had 3 breaking changes over 0.2.1 (`request-property-max-set (enrollWorker)` for `capacity/slots`, `capacity/cpuMillicores`, and `capacity/memoryMebibytes`), and `execution.asyncapi.json` 21 over 0.1.0 (the added maximums at each path of the `capacityDeclared` message). With 0.3.0 and 0.2.0 it passed: "Contract documents have no undeclared breaking change."
- `node --experimental-strip-types --test packages/contracts/test/execution-contracts.test.ts` after `npm run build`: with the documents of `c84ca71`, 19 passed and 1 failed (the new test); with the change, 20 passed, 0 failed.
- `npm run openspec -- validate bound-worker-capacity-schema --strict` passed.

## Independent review

Reviewer: Codex (`gpt-6.1-sol`), reasoning effort medium, read-only sandbox, as assigned by the coordinator, run from the worktree as `codex exec -m gpt-6.1-sol -c model_reasoning_effort='"medium"' -s read-only -C <worktree> - < <prompt-file>`, with the prompt and log outside the worktree.

## Limitations

- `ResourceRequest` keeps CPU and memory without a maximum, although the reservation columns are also `integer`; it is outside this scope and reported to the coordinator.

## Remaining gates

- Coordinator integration into `dev` and archive.
