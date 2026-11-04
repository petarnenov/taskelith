import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { GIT_CLIENT_PINS } from '@taskelith/workspace';

interface Instruction {
  readonly keyword: string;
  readonly args: string;
}

interface PinnedImage {
  readonly file: string;
  // The stage named `AS <stage>`, or the last stage when absent.
  readonly stage?: string;
}

// The images whose worker checks its Git client against the Linux pin.
const IMAGES: readonly PinnedImage[] = [
  { file: 'infra/installation/Dockerfile', stage: 'worker' },
  { file: 'tools/linux-cgroup/Dockerfile' },
];

const VERSION_ARG = 'GIT_PACKAGE_VERSION=';
const INSTALL = 'apt-get install --yes --no-install-recommends "git=${GIT_PACKAGE_VERSION}"';
const PACKAGE_CHECK = `test "$(dpkg-query --show --showformat='\${Version}' git)" = "\${GIT_PACKAGE_VERSION}"`;
const CLIENT_CHECK = `test "$(/usr/bin/git --version)" = "${GIT_CLIENT_PINS.linux.version}"`;

function collapseWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function instructions(source: string): Instruction[] {
  const lines = source.split('\n').filter((line) => !line.trimStart().startsWith('#'));
  return lines
    .join('\n')
    .replace(/\\\n/g, ' ')
    .split('\n')
    .map(collapseWhitespace)
    .filter((line) => line !== '')
    .map((line) => {
      const [keyword = '', ...args] = line.split(' ');
      return { keyword: keyword.toUpperCase(), args: args.join(' ') };
    });
}

function stageInstructions(source: string, stage?: string): Instruction[] {
  const stages: Instruction[][] = [];
  for (const instruction of instructions(source)) {
    if (instruction.keyword === 'FROM') stages.push([]);
    stages.at(-1)?.push(instruction);
  }
  if (stage === undefined) return stages.at(-1) ?? [];
  const suffix = ` AS ${stage}`.toUpperCase();
  return stages.find((body) => body[0]?.args.toUpperCase().endsWith(suffix)) ?? [];
}

function installsAndChecks(instruction: Instruction): boolean {
  if (instruction.keyword !== 'RUN') return false;
  const commands = instruction.args.split('&&').map(collapseWhitespace);
  return [INSTALL, PACKAGE_CHECK, CLIENT_CHECK].every((command) => commands.includes(command));
}

// The stage's Git package version if one RUN installs and checks it.
function pinnedGitPackage(source: string, stage?: string): string | undefined {
  const body = stageInstructions(source, stage);
  if (!body.some(installsAndChecks)) return undefined;
  const arg = body.find(({ keyword, args }) => keyword === 'ARG' && args.startsWith(VERSION_ARG));
  return arg?.args.slice(VERSION_ARG.length) || undefined;
}

const PINNED_STAGE = [
  'FROM ubuntu AS worker',
  'ARG GIT_PACKAGE_VERSION=1:2.43.0-1ubuntu7.4',
  'RUN apt-get update \\',
  `  && ${INSTALL} \\`,
  `  && ${PACKAGE_CHECK} \\`,
  `  && ${CLIENT_CHECK} \\`,
  '  && rm -rf /var/lib/apt/lists/*',
].join('\n');

test('the worker and Linux test images install, check, and pin the same Git package', () => {
  const versions = IMAGES.map(({ file, stage }) => pinnedGitPackage(readFileSync(file, 'utf8'), stage));
  assert.ok(versions[0], `${IMAGES[0]?.file} installs and checks a Git package`);
  assert.deepEqual(versions, IMAGES.map(() => versions[0]));
});

test('a stage pins its package when one RUN installs it and checks package and client', () => {
  assert.equal(pinnedGitPackage(PINNED_STAGE), '1:2.43.0-1ubuntu7.4');
  assert.equal(pinnedGitPackage(PINNED_STAGE, 'worker'), '1:2.43.0-1ubuntu7.4');
});

test('a commented-out check pins nothing', () => {
  const disabled = PINNED_STAGE.replace(`  && ${CLIENT_CHECK}`, `#  && ${CLIENT_CHECK}`);
  assert.equal(pinnedGitPackage(disabled), undefined);
});

test('a check of another client version pins nothing', () => {
  const other = PINNED_STAGE.replace(GIT_CLIENT_PINS.linux.version, 'git version 2.44.0');
  assert.equal(pinnedGitPackage(other), undefined);
});

test('mismatched package versions are different pins', () => {
  const other = PINNED_STAGE.replace('ubuntu7.4', 'ubuntu7.3');
  assert.equal(pinnedGitPackage(other), '1:2.43.0-1ubuntu7.3');
  assert.notEqual(pinnedGitPackage(other), pinnedGitPackage(PINNED_STAGE));
});

test('equivalent whitespace in the RUN keeps the pin', () => {
  const spaced = PINNED_STAGE.replace('install --yes', 'install   --yes');
  assert.equal(pinnedGitPackage(spaced), '1:2.43.0-1ubuntu7.4');
});

test('a trailing space after the ARG keeps the pin', () => {
  const trailing = PINNED_STAGE.replace('ubuntu7.4\n', 'ubuntu7.4 \n');
  assert.equal(pinnedGitPackage(trailing), '1:2.43.0-1ubuntu7.4');
});

test('a check in another stage does not pin the named stage', () => {
  const build = PINNED_STAGE.replace('AS worker', 'AS build');
  const split = `${build}\nFROM build AS worker\nARG GIT_PACKAGE_VERSION=1:2.43.0-1ubuntu7.4`;
  assert.equal(pinnedGitPackage(split, 'worker'), undefined);
});
