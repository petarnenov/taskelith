# Verification

## Local evidence

- Node 24.22.1; workflow npm 12.2.1; release-plugin npm 11.21.1 locked through its supported dependency range.
- All 12 behavioral tests passed, including patch, minor, both breaking-change forms, no-release changes, highest-increment precedence, and release notes rendering.
- Strict OpenSpec validation passed for both changes.
- Packed CLI verification checks the exact public file list and installs outside the checkout. Supports npm 11 and npm 12 pack JSON formats.
- Dependency audit reports two development-tool findings in npm's bundled ip-address and undici dependencies (one moderate and one high). The current npm 12.2.1 also reports these; npm audit fix cannot repair bundled dependencies. No runtime package dependencies are shipped. Track upstream npm fixes; this is not a clean security audit.

## External activation

Completed on 2026-10-24:

- Baseline v0.1.0 tag points to be6a1ed, preserving the source of the existing npm package.
- npm trust list confirms GitHub repository petarnenov/taskelith and workflow release.yml with publishing enabled.
- GitHub Actions run https://github.com/petarnenov/taskelith/actions/runs/40081945287 passed verification and release jobs. Logs confirm successful OIDC exchange without npm secrets, automatic patch selection, and signed provenance.
- Published taskelith@0.1.1 and https://github.com/petarnenov/taskelith/releases/tag/v0.1.1.
- Registry metadata includes SLSA provenance attestations. Installed the public 0.1.1 package into a fresh temporary directory and verified help, version, complete bundled plan, and invalid usage exit status.
- Production-only npm audit reports zero findings. The development-tool findings above remain.
- Initial activation exposed missing npm trust before owner authentication and an incompatible preset major. Trust was configured, the preset was pinned to the version used by the release-notes plugin (9.3.1), and a rendering regression test was added before the successful release.

## Scope

Author verification only. Do not claim an independent review or successful OIDC release until actual run evidence is recorded.

## Integration and archival

Integrated into `main` in commits `397b737`, `b364fb2`, and `77b1450`. No independent review was performed; this record has author verification and the recorded release run evidence only. The owner authorized archival on 2026-10-24 on that basis. Archived with the pinned OpenSpec CLI.
