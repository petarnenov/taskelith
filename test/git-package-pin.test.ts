import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GIT_CLIENT_PINS } from '@taskelith/workspace';

// The images whose worker checks its Git client against the Linux pin.
const DOCKERFILES = ['infra/installation/Dockerfile', 'tools/linux-cgroup/Dockerfile'];

function gitPackageVersion(source: string): string | undefined {
  return /^ARG GIT_PACKAGE_VERSION=(\S+)$/m.exec(source)?.[1];
}

test('the worker and Linux test images pin the same Git package', () => {
  const versions = DOCKERFILES.map((file) => gitPackageVersion(readFileSync(file, 'utf8')));
  assert.ok(versions[0], `${DOCKERFILES[0]} pins a Git package`);
  assert.deepEqual(versions, DOCKERFILES.map(() => versions[0]));
});

test('both images install the pinned package and check the pinned client', () => {
  const versionCheck = `test "$(/usr/bin/git --version)" = "${GIT_CLIENT_PINS.linux.version}"`;
  for (const file of DOCKERFILES) {
    const source = readFileSync(file, 'utf8');
    assert.ok(source.includes('install --yes --no-install-recommends "git=${GIT_PACKAGE_VERSION}"'), file);
    assert.ok(source.includes(`--showformat='\${Version}' git)" = "\${GIT_PACKAGE_VERSION}"`), file);
    assert.ok(source.includes(versionCheck), file);
  }
});
