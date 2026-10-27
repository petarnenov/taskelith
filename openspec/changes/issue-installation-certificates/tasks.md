## 1. Contract first

- [x] 1.1 Proposal, design with the decisions record and the review checklist, `checklist.json`
- [x] 1.2 Spec deltas: `installation-enrollment`, `control-plane-api`, `nats-transport`, `local-installation`, `execution-observability`
- [ ] 1.3 Installation contract sections 1 (O3), 3, 7, 8, and 9; G3 plan deferrals; local installation guide

## 2. Dependency

- [ ] 2.1 Qualify `@peculiar/x509@2.2.0` and `reflect-metadata@0.2.2`: record, register row, inventory

## 3. Issuance

- [ ] 3.1 `CertificateIssuer` port and host and validity rules in `@taskelith/fleet`
- [ ] 3.2 `X509CertificateIssuer` in `@taskelith/certificates`
- [ ] 3.3 Installation authority at `init`; `issue-installation-certificates`; host settings

## 4. TLS

- [ ] 4.1 Worker API and browser endpoint over HTTPS; settings validated at start
- [ ] 4.2 Default broker trust of the control plane and the administrative entry
- [ ] 4.3 Installation NATS requires TLS; worker trust volume; `make installation-certificates`; scripts

## 5. Redaction and hygiene

- [ ] 5.1 PEM private-key shape; `scrubEnvironment` drops TLS key variables
- [ ] 5.2 `npm run verify:private-keys` in `make verify`; ignore rules

## 6. Records

- [ ] 6.1 `npm run openspec -- validate issue-installation-certificates --strict` and `make verify`
- [ ] 6.2 `verification.md` drafted
- [ ] 6.3 Independent review passes and their fixes
- [ ] 6.4 Archive under worker step 7
