## 1. Linux composition

- [x] 1.1 Run the scenarios on Linux only when the containment parent and the execution account are set, and pass them to the composed worker
- [x] 1.2 Pass the containment parent to the armed supervisor as CP4 does, and let the scripted child, as the execution account, reach its files
- [x] 1.3 Expect the Linux rows of supervisor identity section 6 for CP7 to CP9
- [x] 1.4 Let the scenario recorder take the commit from `TASKELITH_SCENARIO_COMMIT`

## 2. Make target

- [x] 2.1 Share the cgroup layout of the Linux test image between `verify-linux-cgroup` and the crash windows
- [x] 2.2 Add `make verify-linux-crash-windows`: the privileged image on the host network of its own services, out of `make verify`

## 3. Records

- [x] 3.1 Evidence run with seed `2776760789` into `results.jsonl`, `verification.md`, and an empty `findings.jsonl`
- [x] 3.2 Record the CP9 failure as candidate defect L1 without a product fix
- [x] 3.3 `make verify`, `make verify-linux-cgroup`, strict validation, and the comment check
- [ ] 3.4 Independent review (Claude Code `claude-fable-5-1`)
