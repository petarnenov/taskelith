import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const wrapper = resolve('scripts/with-pinned-node.sh');
const pin = '24.22.1';

// Like nvm, the fake leaves PATH order alone on use; install marks the pin
// as installed, and which names its bin directory.
const fakeNvm = `nvm() {
  case "$1" in
    use|which) [ -e "$NVM_DIR/installed" ] || return 1 ;;
    install) : > "$NVM_DIR/installed" ;;
  esac
  case "$1" in
    which) echo "$FAKE_PINNED_BIN/node" ;;
    version) echo "v$NODE_PIN" ;;
  esac
}
`;

interface Scenario {
  readonly mode: 'install' | 'use';
  readonly shellVersion: string;
  readonly pinInstalled: boolean;
}

interface Outcome {
  readonly selectedNode: string;
  readonly shellNode: string;
  readonly pinnedNode: string;
  readonly installed: boolean;
}

function writeNode(directory: string, version: string): string {
  mkdirSync(directory, { recursive: true });
  const node = join(directory, 'node');
  writeFileSync(node, `#!/bin/sh\necho ${version}\n`);
  chmodSync(node, 0o755);
  return node;
}

function runWrapper(scenario: Scenario): Outcome {
  const root = mkdtempSync(join(tmpdir(), 'taskelith-pinned-node-'));
  try {
    const nvmDir = join(root, 'nvm');
    const pinnedBin = join(nvmDir, 'versions/node', `v${pin}`, 'bin');
    const shellNode = writeNode(join(root, 'local/bin'), scenario.shellVersion);
    const pinnedNode = writeNode(pinnedBin, `v${pin}`);
    writeFileSync(join(nvmDir, 'nvm.sh'), fakeNvm);
    if (scenario.pinInstalled) writeFileSync(join(nvmDir, 'installed'), '');
    const run = spawnSync('bash', [wrapper, scenario.mode, 'sh', '-c', 'command -v node'], {
      encoding: 'utf8',
      env: {
        PATH: [join(root, 'local/bin'), pinnedBin, '/usr/bin', '/bin'].join(':'),
        NVM_DIR: nvmDir,
        NODE_PIN: pin,
        FAKE_PINNED_BIN: pinnedBin
      }
    });
    assert.equal(run.status, 0, run.stderr);
    return {
      selectedNode: run.stdout.trim(),
      shellNode,
      pinnedNode,
      installed: existsSync(join(nvmDir, 'installed'))
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('use mode runs the pinned Node.js although another version comes first in PATH', () => {
  const outcome = runWrapper({ mode: 'use', shellVersion: 'v24.22.0', pinInstalled: true });
  assert.equal(outcome.selectedNode, outcome.pinnedNode);
});

test('use mode runs the pinned Node.js although the same version comes first in PATH', () => {
  const outcome = runWrapper({ mode: 'use', shellVersion: `v${pin}`, pinInstalled: true });
  assert.equal(outcome.selectedNode, outcome.pinnedNode);
});

test('install mode installs the missing pin and runs it although another version comes first', () => {
  const outcome = runWrapper({ mode: 'install', shellVersion: 'v24.22.0', pinInstalled: false });
  assert.ok(outcome.installed);
  assert.equal(outcome.selectedNode, outcome.pinnedNode);
});

test('use mode keeps the shell Node.js when nvm does not have the pin', () => {
  const outcome = runWrapper({ mode: 'use', shellVersion: 'v24.22.0', pinInstalled: false });
  assert.equal(outcome.selectedNode, outcome.shellNode);
});
