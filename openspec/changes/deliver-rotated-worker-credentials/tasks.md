## 1. Contract first

- [x] 1.1 Proposal, design with the decisions and their sources, the review checklist in `checklist.json`
- [x] 1.2 Spec deltas: `installation-enrollment`, `control-plane-api`, `execution-wire-contracts`, `nats-transport`, `worker-journal-adapter`, `worker-runtime`
- [x] 1.3 Execution OpenAPI 0.7.0 (`renewWorkerCredentials`, `confirmWorkerCredentials`) and AsyncAPI 0.8.0 (`worker.credentials.rotation-requested`), with the AsyncAPI breaking changes declared in `packages/contracts/breaking-changes.json`
- [x] 1.4 Installation contract, worker journal contract, execution wire contracts, trust model, operational targets, and the follow-up line of G3 plan row 26

## 2. Control plane

- [x] 2.1 Audit subject and the four worker-credential kinds; one audit write helper
- [x] 2.2 Rotation domain, registry port, in-memory and PostgreSQL registries, conformance
- [x] 2.3 Request, renewal, confirmation, and the cap in `EnrollmentService`; broker JWT signing for a worker's key
- [x] 2.4 Routes and handlers; `rotate-worker --actor --reason` without secrets; the notice in the request's transaction; the sweep's revocations through the launch-revoking registry

## 3. Worker

- [x] 3.1 `credentials-rejected` classification; worker NKey generation
- [x] 3.2 Identity format 2, pending and adoption files
- [x] 3.3 Renewal client; the bearer read per request
- [x] 3.4 Rotation driver, notice dispatch, broker re-dial, resume at start, terminal `credentials-expired`

## 4. Records

- [x] 4.1 `npm run openspec -- validate deliver-rotated-worker-credentials --strict`, `make verify`, and `make verify-installation`
- [x] 4.2 `verification.md` with the fail-before evidence and the generated part
- [ ] 4.3 Independent review passes and their fixes
- [ ] 4.4 Archive under worker step 7
- [ ] 4.5 Handoff to the coordinator
