## Context

The Git workspace contract named each workspace directory after the attempt identifier and each task branch `taskelith/<taskId>`, and refused any identifier outside letters, digits, `-`, and `_` with `invalid` and reason `unsafe-name`. It relied on the control plane minting identifiers in that form (section 14, obligation on item 9). The checked facts:

- G2 task identifiers are client-chosen. `SubmitTaskRequest.taskId` is an `Identifier` (`packages/contracts/documents/sdlc.openapi.json:560`), whose schema allows 1 to 128 printable ASCII characters without whitespace (`packages/contracts/documents/sdlc.openapi.json:312`, `packages/kernel/src/identifier.ts:10-11`). Task creation uses the requested identifier as is (`apps/control-plane/src/application/task-creation.ts:64`), and a delegation parses the child's identifier the same way (`apps/control-plane/src/application/delegation-service.ts:75`).
- G2 attempt identifiers are minted: `t` followed by a SHA-256 in hexadecimal (`apps/control-plane/src/application/attempt-identities.ts:8-16`), which the old rule accepted. A worker still receives them as plain `Identifier` values on the wire.
- The workspace module, like every module, builds with `"types": []` (`packages/modules/workspace/tsconfig.json`), so its domain has no Node built-ins such as `node:crypto`.

## Goals / Non-Goals

**Goals:** every identifier the API accepts gets a workspace directory and a task branch; names are deterministic, distinct for distinct identifiers, safe as a path segment, and valid Git branch names; the contract, the spec, the domain rules, the conformance suite, and the test double agree.

**Non-Goals:** restricting identifiers in the API or OpenAPI documents (coordinator decision); the Git adapter (item 16); a migration of existing workspaces, of which none exist.

## Decisions

### D1. A name is a readable prefix and a digest

A name is `<prefix>-<digest>`, or `<digest>` alone when the prefix is empty. The prefix keeps a name recognisable in `git branch` output and directory listings; the digest makes it unique. A safe identifier keeps the digest too: mapping safe identifiers to themselves would let `a-<digest of a/b>` collide with the derived name of `a/b`. One private function, `workspaceName`, computes it, and `workspaceDirectoryName` and `taskBranchName` apply it to attempt and task identifiers; both now return a string, because no identifier is refused.

### D2. Prefix: ASCII letters, digits, `-`, and `_`, at most 40 characters

Every code point other than `[A-Za-z0-9_-]` becomes `_`; leading `-` and `_` are removed, so a name starts with a letter or digit, never looks like a command option, and never starts with `.`; the result is cut to 40 characters (`WORKSPACE_NAME_RULES.prefixMaxLength`). A name therefore has at most 40 + 1 + 32 = 73 characters, a branch at most 83 with `taskelith/`, and a staging entry at most 82, far below the 255-byte limit of a path segment. Without `.`, `/`, `:`, `~`, `^`, `?`, `*`, `[`, `\`, `@`, spaces, and control characters, a name cannot contain `..`, end in `.lock`, or hold any character that `git check-ref-format` refuses, so `taskelith/<name>` is a valid branch; the tests check this with the real `git check-ref-format --branch`.

### D3. Digest: SHA-256 of the UTF-8 bytes, 32 hexadecimal characters

The digest is the SHA-256 of the full identifier's UTF-8 bytes in lowercase hexadecimal, cut to 32 characters (128 bits, `WORKSPACE_NAME_RULES.digestHexLength`). It is the fixed last 32 characters of a name, so two names are equal only when their digests are; identifiers that share a prefix, such as `a/b` and `a_b`, still differ. Two distinct identifiers collide only on a 128-bit collision of truncated SHA-256: the birthday bound gives about n²/2¹²⁹, about 1.5 × 10⁻²¹ for a billion identifiers, and a client that chooses identifiers to collide needs about 2⁶⁴ hash computations. 64 bits would allow a deliberate collision with about 2³² computations, which is cheap, so 128 bits is the shortest length that keeps a chosen collision out of reach. Identifiers are ASCII by their schema, so their UTF-8 bytes are their characters; the function stays total over any string.

### D4. Attempts too, and `list` reads the record

The coordinator's decision covers branch and directory names. Attempt identifiers are minted safe today, but the port receives them as plain identifiers, so the workspace derives directory names the same way rather than trusting the minting form again. A directory name no longer holds the whole identifier, so the workspace record keeps the attempt identifier and `list` reports it from there, in the code point order of the identifiers as before.

### D5. A Node-free SHA-256 in the domain

The domain has no Node built-ins (`"types": []`), and the name rule belongs there, used by the double, the suite, and the item 16 adapter alike. The module therefore carries a short SHA-256 of FIPS 180-4 (`src/domain/sha256.ts`); the tests compare its output with `node:crypto` at every padding and block boundary up to 128 bytes. Rejected: Node types for the workspace module (breaks the Node-free convention of every module); a digest port injected by the adapter (every caller and the suite would need it, and a wrong adapter digest would silently change every branch); a hashing library such as `@noble/hashes` (a new dependency with its inventory and license review, beyond an S task).

### D6. No `unsafe-name`

With every identifier named, nothing can be unsafe, so `unsafe-name` leaves `WORKSPACE_FAILURE_REASONS` and the contract's failure table, and `prepare`, `handOff`, `reclaim`, and the other operations no longer check names first. An `at-head` prepare for the task `../unsafe` with a foreign credential now fails with `forbidden`, the next check in order.

### D7. Tests and defects

The domain tests check the form against hand-computed names, safety and determinism, Git branch validity through `git check-ref-format --branch`, shared prefixes, and the digest against `node:crypto`. The conformance case "derives distinct workspace names and task branches from any identifiers" prepares, lists, and removes workspaces for `../attempt`, `a/b`, `a_b`, and `..` with the tasks `feature/login`, `a/b`, `a_b`, and `v1.2`, and refuses the task `../unsafe` at a head with a foreign credential with `forbidden`. Two double defects must fail it: one that still refuses identifiers outside the former safe form, and one that names the branch by the raw task identifier; the former `checksTaskOnlyOnBranch` defect has no meaning any more and is removed.

## Risks / Trade-offs

- A branch name no longer equals the task identifier; an operator finds a task's branch by its prefix or through `taskBranchName`.
- The hand-written SHA-256 is product code that a library could replace; its tests pin it to `node:crypto`.

## Review checklist

Review checklist (capabilities git-workspace-port, workspace-packages; files packages/modules/workspace/**, packages/adapters/**, docs/contracts/git-workspace.md), most frequent finding categories first:
1. spec-wording (10): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "The contract does not fix the account and cgroup under which the Git processes of workspace operations run"
2. contract-drift (6): Code, a contract document, and its specification disagree. Example: "The safe name rule rejects client-chosen G2 task identifiers, so such a task never gets a workspace"
3. error-handling (6): A failure is swallowed, misreported, or leaves inconsistent state. Example: "The double's reclaim opened every non-directory as a file, so a hard-linked named pipe blocked it forever"
4. concurrency-race (3): Concurrent operations can interleave into a wrong state or result. Example: "The double checked for another hand-off record and wrote its own in separate steps, so two concurrent hand-offs both succeeded"
5. docs (1): Documentation is missing, wrong, or out of date with the change. Example: "G3 plan rows 37 and 41 do not carry the item 41 decision, and rows 18 and 21 do not carry the contract's new obligations"
6. redaction (1): A secret or private value can leak into output, logs, or records. Example: "The promise that a secret is never logged relies on redaction that G2 lacks"
7. scope (1): The change does more or less than its assigned scope. Example: "Linux supervisor test starts and kills supervisors with the inherited coverage directory"

Record quality (archived findings under openspec/changes/), most frequent finding categories first:
1. evidence-mismatch (38): A recorded result, count, or claim differs from what the checks show. Example: "The record gave the spec delta body as 477 characters, one more than its length"
2. docs (36): Documentation is missing, wrong, or out of date with the change. Example: "The record groups the #settle comment with comments that said a pass stops only when the store fails, though it was about waits"
3. stale-citation (19): A cited file line, commit, or record no longer matches its target. Example: "The plan checklist named a capability that does not exist and a docs glob that matches no file"
4. spec-wording (17): A requirement or scenario is ambiguous, untestable, or inaccurate. Example: "Scenario Capacity freed during a pass expects the next pass to place the declined task, which fails when earlier offers were own declines and one placement, leaving the cursor before a later project"
5. process (8): A protocol, governance, or review rule was not followed. Example: "Task 4.2 is unticked although review pass 1 is recorded"
6. contract-drift (6): Code, a contract document, and its specification disagree. Example: "The proposal and verification record said the index and checklist commands were unchanged, although they now refuse invalid pass summaries"
7. scope (5): The change does more or less than its assigned scope. Example: "Design D6 defines size M as a contract, its spec, and its port types, while the SCM follow-up also changes the port's readers and conformance case"
