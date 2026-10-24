# Verification

## Local evidence

- Node 24.22.1; workflow npm 12.2.1; release-plugin npm 11.21.1 locked through its supported dependency range.
- All 11 behavioral tests passed, including patch, minor, both breaking-change forms, no-release changes, and highest-increment precedence.
- Strict OpenSpec validation passed for both changes.
- Packed CLI verification checks the exact public file list and installs outside the checkout. Supports npm 11 and npm 12 pack JSON formats.
- Dependency audit reports two development-tool findings in npm's bundled ip-address and undici dependencies (one moderate and one high). The current npm 12.2.1 also reports these; npm audit fix cannot repair bundled dependencies. No runtime package dependencies are shipped. Track upstream npm fixes; this is not a clean security audit.

## External activation

Pending: pushed workflow, baseline release tag, npm trusted publisher configuration, successful GitHub Actions OIDC release, and registry-installed CLI verification.

## Scope

Author verification only. Do not claim an independent review or successful OIDC release until actual run evidence is recorded.
