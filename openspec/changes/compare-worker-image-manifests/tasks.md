## 1. Change

- [x] 1.1 Create the change `compare-worker-image-manifests` and save the checklist
- [x] 1.2 Choose how to read the platform image on both image stores (design, "Decisions")

## 2. Contract first

- [x] 2.1 Spec delta of `local-installation`: modify "Opt-in reproducibility check"
- [x] 2.2 Update `docs/local-installation.md`

## 3. Implementation

- [x] 3.1 Test that fails before the change: only the image IDs differ, as on the containerd store
- [x] 3.2 `scripts/installation.sh`: compare the config digests and the ordered layer digests, and name what differs
- [x] 3.3 Tests of a differing layer, differing configs, a missing layer, a failed save, a saved manifest without one config blob, and a failed layer read

## 4. Verification

- [x] 4.1 Run `make verify-worker-image-reproducible` on this host and record the result and the image store
- [x] 4.2 `npm run openspec -- validate compare-worker-image-manifests --strict` and `make verify`
- [x] 4.3 Record `verification.md`

## 5. Review and archive

- [ ] 5.1 Independent review passes assigned by the coordinator
- [ ] 5.2 Archive the change
