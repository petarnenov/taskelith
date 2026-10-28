## 1. Contract first

- [x] 1.1 Proposal, design with the decisions record and the review checklist, `checklist.json`
- [x] 1.2 Spec deltas: `installation-enrollment`, `control-plane-api`, `execution-wire-contracts`, `worker-runtime`, `local-installation`
- [x] 1.3 `readInstallationCa` and `InstallationCa` in the execution OpenAPI document (0.5.0)
- [x] 1.4 Installation contract sections 5, 7, 9, and 10; execution wire contracts' document table; account pool contract section 7; local installation guide

## 2. Control plane

- [x] 2.1 The CA read and checked at start; `readInstallationCa` without a credential
- [x] 2.2 `installationCaSha256` in the output of `issue-enrollment-token`

## 3. Worker

- [x] 3.1 `InstallationCaSource` port; the CA read and the pinned `undici` `Agent` in `@taskelith/worker-control-plane-client`; register row for `undici@7.30.1`
- [x] 3.2 `worker/installation-ca.pem` in `@taskelith/worker-journal`; a root without it fails closed and names the remedy (no migration, pre-release)
- [x] 3.3 Settings: `TASKELITH_INSTALLATION_CA_SHA256`, `https:` only, no `TASKELITH_NATS_CA`
- [x] 3.4 The check before the token; the pinned CA for the launch authority and the broker
- [x] 3.5 Tests: fingerprint mismatch, system-trusted foreign certificate, no listening socket

## 4. Installation and harnesses

- [x] 4.1 Compose and `scripts/installation.sh`: the fingerprint for the Linux worker; no trust volume
- [x] 4.2 Native scenario script and test harnesses that start workers

## 5. Records

- [x] 5.1 `npm run openspec -- validate enroll-remote-worker-over-tls --strict` and `make verify`
- [x] 5.2 `verification.md` drafted
- [x] 5.3 Independent review passes and their fixes
- [ ] 5.4 Archive under worker step 7
- [ ] 5.5 Handoff to the coordinator
