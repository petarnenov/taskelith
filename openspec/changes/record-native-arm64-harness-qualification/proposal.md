## Why

G2 work item 26 (`qualify-harnesses-in-worker-image`, archived on 2026-10-26) qualified the pinned Claude Code and Codex packages in the `worker-harnesses` image variant on linux/amd64 only. linux/arm64 was recorded as not run: the emulated build failed under the x86_64 host's QEMU, and no native arm64 host was available. The coordinator decided that a native run on an Apple Silicon host follows as an addendum. Such a host is now available, so this change closes that remaining gate of item 26.

## What Changes

- **Native run.** `make qualify-harnesses OUT=<dir> PLATFORMS=linux/arm64` runs on an Apple Silicon host whose Docker engine is linux/arm64, with no emulation. The image variant, the scripts, and the steps stay unchanged.
- **Records.** `docs/qualification/claude-code.md` and `docs/qualification/codex.md` gain the linux/arm64 results in their "Linux worker image" sections, and the native linux/arm64 item leaves their "Remaining before admission" lists. The emulated linux/arm64 entry stays "not run".
- **Register.** `docs/dependencies.md` drops linux/arm64 from the open Linux gates of the two harness rows.

The scenarios that need a login stay not run on both architectures. No login, subscription, or model call is part of this change.

## Capabilities

### Modified Capabilities

None. The `harness-qualification` requirement already asks for a result on every architecture and a gate for each without native evidence; this change records that evidence. `skip_specs: true` is set.

## Impact

Documentation only: two qualification records, the dependency register, and this change's records. No code, script, image, test, contract, or dependency changes. The commits use `docs` and `chore`.
