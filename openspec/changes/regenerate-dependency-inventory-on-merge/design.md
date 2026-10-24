## Context

The inventory files are a pure function of the locked dependencies, the installed packages, the pinned toolchain, and the generator. `licenses.json` already records SHA-256 provenance hashes of its inputs: `package.json`, `package-lock.json`, `.nvmrc`, and the two generator scripts. A git merge driver resolves one file at a time while the merge is in progress. It cannot run npm on the merged tree, because the other files may not be merged yet and `node_modules` still matches the old lockfile.

## Goals / Non-Goals

- Goals: no hand resolution of generated JSON; a deterministic final result; a real dependency change is never hidden.
- Non-goals: automatic regeneration or commits inside git hooks; changes to what the inventory contains; GitHub's server-side merge, which ignores custom drivers.

## Decisions

- **Driver: keep the current side.** The driver command is `true`, which leaves git's "ours" file in place and reports success. It is deterministic, needs no script, and never mixes lines of two inventories. Git's default line merge could produce a well-formed file that matches neither side, which a reader could mistake for generated evidence. Taking the other side, or a union of both, would be no more correct, because both sides are stale against the merged inputs.
- **Detection: provenance hashes, without npm.** `staleInventoryInputs` compares the recorded hashes with the merged inputs. It needs no network, no exact toolchain, and no installed packages, so it is fast enough for a `post-merge` hook. If every input matches, the kept file was generated from exactly these inputs. The full drift check in `make verify` still runs afterwards.
- **Post-merge step: report, not regenerate.** Regenerating needs `npm ci` first, because the license inventory reads `node_modules`. That is slow, rewrites the worktree inside a hook, and would leave uncommitted files that the working-tree-based pre-push gate could not tell apart from committed ones. The hook therefore prints the changed inputs and the remedy, `make dependency-inventory` (reinstall, then regenerate under the pinned Node.js and npm), and never blocks the merge. A merge that stops on another conflict runs no hook; `make verify` catches the stale inventory instead.
- **Hard gate: check mode.** `npm run verify:dependencies` checks the provenance first and fails with the same message before the byte-for-byte drift check. A stale inventory therefore cannot pass `make verify` or CI, and the final files depend only on the merged inputs, whichever side the driver kept.
- **Configuration.** The driver value lives in `scripts/environment-checks.ts`. `make setup` adds it when it is missing, `make doctor` reports it, and `make hooks` sets it with `core.hooksPath`. Git shares this configuration across worktrees.

## Risks / Trade-offs

- After the merge, regeneration is one extra command and commit. This is accepted in exchange for keeping hooks free of side effects.
- A clone without the driver configured falls back to git's line merge, which may conflict or mix the two inventories. In both cases `make verify` still fails until the files are regenerated, and `make doctor` names the missing driver.
- The provenance check covers the generator's declared inputs. Inputs it does not hash, such as an installed package's license file, are still covered by the full drift check.
