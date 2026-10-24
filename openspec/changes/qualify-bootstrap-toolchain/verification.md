# Verification

Date: 2026-10-24. Author assessment/verification and independent review recorded separately below.

## Scope and revision

The owner requested continuation after policy acceptance. This task assesses the next G0 item: the installed toolchain register, its evidence, and remaining admission gaps. Base revision: `77b1450d49669da58cac9a486469428031a3acc2`. Working-tree scope: `docs/dependencies.md`, `docs/dependencies/toolchain-metadata.json`, `scripts/collect-toolchain-metadata.ts`, the foundation ledger update, and this OpenSpec change.

No package versions, lockfile, product source, workflow, or runtime configuration changed. The helper is TypeScript and not included in the published package allowlist. Documentation-only product impact; the helper performs read-only public registry requests.

## Results

Environment: Verified under exact CI pins Node v24.22.1 and npm 12.2.1 (initial collection also observed under Node v24.21.0, npm 11.19.0).

- `npm ls --depth=0`: all nine direct packages match exact manifest pins.
- `node --experimental-strip-types scripts/collect-toolchain-metadata.ts`: completed; a second live collection matched the checked-in snapshot records. Checked all nine direct versions, registry/lockfile integrity, declared licenses, and engines against installed manifests.
- `npm test`: build and all 15 behavioral tests passed under Node 24.22.1 / npm 12.2.1.
- `./node_modules/.bin/tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --types node scripts/collect-toolchain-metadata.ts`: standalone helper typecheck passed.
- `OPENSPEC_TELEMETRY=0 npm run openspec -- validate --all --strict --no-interactive`: all six changes passed.
- `npm run verify:package`: actual tarball allowlist, packaged link checks, and isolated installed CLI checks passed. Nothing was published.
- `git diff --check` passed; new dependency documentation and foundation ledger were checked for trailing whitespace and existing relative link targets.
- `npm audit --json`: two vulnerable development packages, moderate ip-address and high undici, inside the release plugin's bundled npm. The command returns nonzero for these findings. No dependency repair or clean development audit is claimed.
- `npm audit --omit=dev --json`: zero reported vulnerabilities.
- `npm sbom --sbom-format=cyclonedx --package-lock-only`: generated valid JSON, CycloneDX 1.5, 459 components.
- Lockfile inspection counted 487 dependency paths and one missing modern license field; the corresponding qrcode-terminal manifest uses legacy Apache 2.0 metadata and contains a LICENSE file. This is not a license-text compliance audit.

Official registry and upstream sources were inspected for release observations, engines, licensing declarations, reporting policies, and operating guidance; links and limitations are in the register. The exact npm snapshot data is public package metadata and contains no registry credentials or local state.

## Independent review

- **Reviewer identity:** Separate OpenAI Codex CLI agent (`codex-cli 0.164.0`), explicitly authorized by the owner on 2026-10-24.
- **Model ID and effort:** `gpt-6.1-sol`, `model_reasoning_effort = "medium"` (configured in `~/.codex/config.toml` and CLI execution, read-only sandbox).
- **Pass 1 (session `01a16d74-cd29-7642-b4e0-28a59e62c662`) & Pass 2 (session `01a16d80-a7e5-7981-86e0-1768a2e1cdd6`):** Reviewed working-tree snapshot over base `77b1450d49669da58cac9a486469428031a3acc2`. Verified `docs/dependencies.md`, `docs/dependencies/toolchain-metadata.json`, `scripts/collect-toolchain-metadata.ts` (including strict TypeScript compilation), and OpenSpec artifacts. Reported 0 findings in `qualify-bootstrap-toolchain`; Pass 2 confirmed 0 findings remain across the working tree.

## Remaining gates

Independent review of this change is complete. No new owner admission decision, review exception, integration, archival, CI run, or deployment is claimed. The installed tools remain candidates under the full architecture qualification standard; the vulnerable bundled npm is replacement-required for admission. Initial usage remains documented historical fact, not retroactive qualification. No runtime service or model was admitted. G0 is not complete.
