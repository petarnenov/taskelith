import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const wrapper = resolve('scripts/with-pinned-node.sh');
const pin = '24.22.1';
const shellNode = 'v24.22.0';

// Like nvm, the fake leaves PATH order alone on use; which names the bin.
const fakeNvm = `nvm() {
  case "$1" in
    use|install|which) [ -z "$FAKE_PIN_MISSING" ] || return 1 ;;
  esac
  case "$1" in
    which) echo "$FAKE_PINNED_BIN/node" ;;
    version) echo "v$NODE_PIN" ;;
  esac
}
`;

function writeNode(directory: string, version: string): void {
  mkdirSync(directory, { recursive: true });
  const node = join(directory, 'node');
  writeFileSync(node, `#!/bin/sh\necho ${version}\n`);
  chmodSync(node, 0o755);
}

function runWrapper(mode: 'install' | 'use', options: { pinMissing?: boolean } = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-pinned-node-'));
  try {
    const shadowBin = join(root, 'local/bin');
    const pinnedBin = join(root, 'nvm/versions/node', `v${pin}`, 'bin');
    writeNode(shadowBin, shellNode);
    writeNode(pinnedBin, `v${pin}`);
    writeFileSync(join(root, 'nvm/nvm.sh'), fakeNvm);
    const run = spawnSync('bash', [wrapper, mode, 'node', '-v'], {
      encoding: 'utf8',
      env: {
        PATH: [shadowBin, pinnedBin, '/usr/bin', '/bin'].join(':'),
        NVM_DIR: join(root, 'nvm'),
        NODE_PIN: pin,
        FAKE_PINNED_BIN: pinnedBin,
        ...(options.pinMissing ? { FAKE_PIN_MISSING: '1' } : {})
      }
    });
    assert.equal(run.status, 0, run.stderr);
    return run.stdout.trim();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('use mode runs the pinned Node.js although another one comes first in PATH', () => {
  assert.equal(runWrapper('use'), `v${pin}`);
});

test('install mode runs the pinned Node.js although another one comes first in PATH', () => {
  assert.equal(runWrapper('install'), `v${pin}`);
});

test('use mode keeps the shell Node.js when nvm does not have the pin', () => {
  assert.equal(runWrapper('use', { pinMissing: true }), shellNode);
});
